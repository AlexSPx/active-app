"""Check the delivered media, including a full decode, rather than source strings."""
import json
from pathlib import Path
import subprocess
import sys

video = Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'out/active-cadence-alive.mp4'
data = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
picture = next(stream for stream in data['streams'] if stream['codec_type']=='video')
audio = next(stream for stream in data['streams'] if stream['codec_type']=='audio')
assert (picture['width'],picture['height']) == (1080,1920), picture
assert picture['codec_name']=='h264' and picture['pix_fmt']=='yuv420p', picture
assert picture['r_frame_rate']=='30/1' and int(picture['nb_frames'])==960, picture
assert abs(float(data['format']['duration'])-32)<.1, data['format']
assert audio['codec_name']=='aac' and audio['channels']==2, audio
result=subprocess.run(['ffmpeg','-v','error','-i',str(video),'-f','null','-'],capture_output=True,text=True,check=True)
assert not result.stderr.strip(), result.stderr
print(f'PASS: {video.name}: 1080×1920, 30fps, 960 frames, 32 seconds, H.264 + stereo AAC; full decode clean.')
