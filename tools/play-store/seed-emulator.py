#!/usr/bin/env python3
"""Populate a disposable, rooted Android emulator with fictional store screenshot data.

Launch the app once before running. Never use against a personal device.
"""
import argparse
import datetime as dt
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def adb(*args, binary=False):
    return subprocess.check_output(['adb', *args], text=not binary).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', default='com.alexspx.activenext')
    parser.add_argument('--date', default=dt.date.today().isoformat())
    parser.add_argument('--active-session', action='store_true')
    args = parser.parse_args()
    if args.package not in {'com.alexspx.activenext', 'com.alexspx.activenext.screenshot'}:
        raise SystemExit('Only the Active Next capture packages are supported.')
    if adb('shell', 'getprop', 'ro.kernel.qemu') != '1':
        raise SystemExit('This fixture may only be used on an emulator.')
    if adb('shell', 'id', '-u') != '0':
        raise SystemExit('Run adb root on the disposable emulator before seeding.')
    today = dt.date.fromisoformat(args.date)
    monday = today - dt.timedelta(days=today.weekday())
    start = monday - dt.timedelta(weeks=8)
    stamp = lambda day, hour=17, minute=0: f'{day.isoformat()}T{hour:02}:{minute:02}:00.000Z'
    catalog = {x['sourceKey']: x for x in json.loads((ROOT / 'apps/client/lib/data/exercise-catalog.json').read_text())}
    plans = [
        ('upper', 'Upper Body', 'Build strength, one good rep at a time.', [
            ('Barbell_Bench_Press_-_Medium_Grip', 70, 8), ('Seated_Cable_Rows', 55, 10),
            ('Dumbbell_Shoulder_Press', 20, 10), ('Side_Lateral_Raise', 8, 12), ('Triceps_Pushdown', 25, 12)]),
        ('lower', 'Lower Body', 'A strong foundation for every session.', [
            ('Barbell_Full_Squat', 90, 8), ('Romanian_Deadlift', 75, 10),
            ('Leg_Press', 140, 10), ('Lying_Leg_Curls', 35, 12), ('Standing_Calf_Raises', 50, 12)]),
        ('pull', 'Pull & Arms', 'Back strength and a little extra for the arms.', [
            ('Seated_Cable_Rows', 55, 10), ('Romanian_Deadlift', 75, 10),
            ('Hammer_Curls', 14, 12), ('Side_Lateral_Raise', 8, 12)]),
        ('full', 'Full Body', 'Finish the week feeling stronger.', [
            ('Barbell_Full_Squat', 90, 8), ('Barbell_Bench_Press_-_Medium_Grip', 70, 8),
            ('Seated_Cable_Rows', 55, 10), ('Dumbbell_Shoulder_Press', 20, 10)]),
    ]
    def exercises(items, week=7, record=False):
        result = []
        for key, weight, reps in items:
            ex = catalog[key]
            load = max(2, round(weight * (0.75 + week / 28) / 2.5) * 2.5)
            common = dict(exerciseId=ex['id'], reps=[reps]*3, weight=[load]*3)
            if record:
                common.update(exerciseName=ex['name'])
            else:
                common.update(exerciseTitle=ex['name'], category=ex['category'],
                              primaryMuscles=ex['primaryMuscles'], secondaryMuscles=ex['secondaryMuscles'])
            result.append(common)
        return result
    adb('shell', 'am', 'force-stop', args.package)
    base = f'/data/data/{args.package}'
    profile_path = f'{base}/files/SQLite/profile-local:device.db'
    storage_path = f'{base}/databases/RKStorage'
    with tempfile.TemporaryDirectory(prefix='active-store-seed-') as tmp:
        tmp = Path(tmp)
        def pull_database(remote, name):
            uid = adb('shell', 'stat', '-c', '%u', remote)
            local = tmp / name
            subprocess.run(['adb', 'pull', remote, str(local)], check=True, stdout=subprocess.DEVNULL)
            for suffix in ['-wal']:
                subprocess.run(['adb', 'pull', remote+suffix, str(local)+suffix], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return local, uid
        profile, profile_uid = pull_database(profile_path, 'profile.db')
        storage, storage_uid = pull_database(storage_path, 'storage.db')
        db = sqlite3.connect(profile)
        if not db.execute("SELECT name FROM sqlite_master WHERE name='user_profile'").fetchone():
            raise SystemExit('Launch the app once before seeding.')
        for table in ['sync_queue', 'id_remaps', 'workout_records', 'routines', 'workouts']:
            db.execute(f'DELETE FROM {table}')
        for order, (key, title, notes, items) in enumerate(plans):
            ident = f'store-{key}'
            template = dict(id=ident, exercises=exercises(items), createdAt=stamp(start), updatedAt=stamp(today))
            db.execute('INSERT INTO workouts (id,title,notes,created_at,updated_at,workout_template,is_synced) VALUES (?,?,?,?,?,?,0)',
                       (ident,title,notes,stamp(start,16,3-order),stamp(today),json.dumps(template)))
        personal_bests = {}
        for week in range(8):
            for day_index, (key,title,notes,items) in zip([0,1,3,5], plans):
                day = start + dt.timedelta(weeks=week, days=day_index)
                records = exercises(items,week,record=True)
                for ex in records:
                    one_rm = round(ex['weight'][0] * (1+ex['reps'][0]/30),1)
                    volume = sum(w*r for w,r in zip(ex['weight'],ex['reps']))
                    old_rm,old_volume = personal_bests.get(ex['exerciseId'], (0,0))
                    if one_rm > old_rm:
                        ex.update(achievedOneRmValue=one_rm, achievedOneRmSetIndex=0)
                    if volume > old_volume:
                        ex['achievedTotalVolumeValue'] = volume
                    personal_bests[ex['exerciseId']] = (max(old_rm,one_rm),max(old_volume,volume))
                db.execute('INSERT INTO workout_records (id,workout_id,workout_title,notes,created_at,start_time,exercise_records,is_synced) VALUES (?,?,?,?,?,?,?,0)',
                    (f'store-record-{week}-{key}',f'store-{key}',title,'',stamp(day,17,48),stamp(day),json.dumps(records)))
        days = ['upper','lower',None,'pull',None,'full',None]
        pattern = [dict(dayIndex=i+1,dayType='WORKOUT' if key else 'REST',workoutId=f'store-{key}' if key else None) for i,key in enumerate(days)]
        db.execute('INSERT INTO routines (id,name,description,routine_type,pattern,start_date,created_at,updated_at,is_active,is_synced) VALUES (?,?,?,?,?,?,?,?,1,0)',
            ('store-routine','Stronger Every Week','Four focused sessions. Room to recover.','SEQUENTIAL',json.dumps(pattern),stamp(start,0),stamp(start),stamp(today)))
        user = json.loads(db.execute('SELECT user_json FROM user_profile WHERE id=1').fetchone()[0])
        user.update(firstName='Sam',lastName='',username='sam',timezone='Europe/Sofia',registrationCompleted=True,
                    measurements=dict(weightKg=75,heightCm=178),activeRoutineId='store-routine',notificationFrequency=0)
        db.execute('UPDATE user_profile SET user_json=? WHERE id=1',(json.dumps(user),))
        db.commit(); db.execute('PRAGMA wal_checkpoint(TRUNCATE)'); db.close()
        db = sqlite3.connect(storage)
        def put(key,state):
            db.execute('INSERT OR REPLACE INTO catalystLocalStorage (key,value) VALUES (?,?)',(key,json.dumps(dict(state=state,version=0))))
        put('settings-storage:local%3Adevice',dict(restTimerEnabled=True,restTimerDefaultSeconds=90,timeZone='Europe/Sofia',theme='light',bodyWeight=75,height=178,bodyWeightUnit='kg',heightUnit='cm'))
        bench = catalog['Barbell_Bench_Press_-_Medium_Grip']
        squat = catalog['Barbell_Full_Squat']
        put('widget-storage:local%3Adevice',dict(widgets=[dict(id='store-bench',exerciseId=bench['id'],exerciseName=bench['name'],metric='oneRm',position=0,createdAt=stamp(start)), dict(id='store-squat',exerciseId=squat['id'],exerciseName=squat['name'],metric='maxWeight',position=1,createdAt=stamp(start))]))
        running = None
        if args.active_session:
            session_exercises = []
            for index, (key, weight, reps) in enumerate(plans[0][3]):
                ex = dict(catalog[key])
                session_id = f'store-upper-ex-{index}'
                ex.update(sessionId=session_id, sets=3, reps=reps,
                    sessionSets=[dict(id=f'{session_id}-set-{i+1}', reps=reps, weight=weight,
                                      completed=index == 0 and i < 2) for i in range(3)])
                session_exercises.append(ex)
            running = dict(id='store-upper', name='Upper Body',
                startTime=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(minutes=18, seconds=24)).isoformat(),
                exercises=session_exercises, currentExerciseIndex=0, completedExercises=0)
        put('running-workout-storage:local%3Adevice',dict(runningWorkout=running))
        db.commit(); db.execute('PRAGMA wal_checkpoint(TRUNCATE)'); db.close()
        for local,remote,uid in [(profile,profile_path,profile_uid),(storage,storage_path,storage_uid)]:
            for suffix in ['-wal','-shm']:
                subprocess.run(['adb','shell','rm',remote+suffix],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            subprocess.run(['adb','push',str(local),remote],check=True,stdout=subprocess.DEVNULL)
            adb('shell','chown',f'{uid}:{uid}',remote)
        print(f'Seeded {args.package}: 4 templates, 1 active routine, 32 sessions ending {monday-dt.timedelta(days=2)}.')


if __name__ == '__main__':
    main()
