import React from 'react'
import {
  AbsoluteFill,
  Sequence,
  Img,
  Html5Audio,
  staticFile,
  useCurrentFrame,
  spring,
  interpolate,
  Easing,
} from 'remotion'
import './style.css'

const C = {
  plum: '#2d2235',
  lilac: '#e3d7ee',
  blush: '#f1dce2',
  white: '#faf5fc',
  muted: '#c0afcb',
  panel: '#42314d',
  accent: '#b99ccf',
}
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const ramp = (f, a, b, x = 0, y = 1) => interpolate(f, [a, b], [x, y], clamp)
const pop = (f, d = 0) =>
  spring({ frame: f - d, fps: 30, config: { damping: 17, stiffness: 145, mass: 0.8 } })
const at = (x, y, extra = {}) => ({ position: 'absolute', left: x, top: y, ...extra })

function Mark({ size = 70, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth="9"
      strokeLinecap="round"
    >
      <path d="M17 40v20m14-31v42m38-42v42m14-31v20M31 50h38" />
    </svg>
  )
}
function Brand({ dark = false }) {
  return (
    <div className="brand" style={{ color: dark ? C.plum : C.lilac }}>
      <Mark size={62} />
      <span>active next</span>
    </div>
  )
}
function Word({ children, delay = 0, style = {} }) {
  const f = useCurrentFrame()
  const p = pop(f, delay)
  return (
    <div style={{ overflow: 'hidden', ...style }}>
      <div
        style={{ transform: `translateY(${(1 - p) * 115}%)`, opacity: ramp(f, delay, delay + 7) }}
      >
        {children}
      </div>
    </div>
  )
}
function Caption({ children, dark = false }) {
  return (
    <div className="caption" style={{ color: dark ? C.plum : C.muted }}>
      {children}
    </div>
  )
}
function Pulse({ f, color = C.lilac, cx = 540, cy = 1050 }) {
  return (
    <>
      {[0, 1, 2].map((i) => {
        const p = ((f + i * 25) % 90) / 90
        return (
          <div
            key={i}
            style={at(cx, cy, {
              width: 300 + p * 1000,
              height: 300 + p * 1000,
              border: `2px solid ${color}`,
              borderRadius: '50%',
              transform: 'translate(-50%,-50%)',
              opacity: (1 - p) * 0.26,
            })}
          />
        )
      })}
    </>
  )
}
function Scene({ children, color = C.plum, duration }) {
  const f = useCurrentFrame()
  const exit = ramp(f, duration - 12, duration, 0, 1)
  return (
    <AbsoluteFill
      style={{
        background: color,
        overflow: 'hidden',
        transform: `translateY(${-exit * 150}px)`,
        opacity: 1 - exit,
      }}
    >
      {children}
    </AbsoluteFill>
  )
}
function Phone({ screen, f, x = 245, y = 660, w = 590, rotate = -7 }) {
  const p = pop(f, 8)
  return (
    <div
      style={at(x, y, {
        width: w,
        padding: 12,
        borderRadius: 65,
        background: '#1d1623',
        border: '3px solid #807087',
        boxShadow: '20px 40px 70px #160b2545',
        transform: `perspective(1600px) translateY(${(1 - p) * 550 + Math.sin(f / 28) * 9}px) rotateY(${(1 - p) * 26}deg) rotate(${rotate + Math.sin(f / 40) * 1.2}deg)`,
      })}
    >
      <div style={{ borderRadius: 50, overflow: 'hidden', position: 'relative' }}>
        <Img
          src={staticFile(`screens/${screen}.png`)}
          style={{ display: 'block', width: '100%' }}
        />
        <div
          style={at('38%', 9, {
            width: '24%',
            height: 21,
            borderRadius: 20,
            background: '#1d1623',
          })}
        />
      </div>
    </div>
  )
}
function Intro() {
  const f = useCurrentFrame()
  const beat = Math.exp(-(f % 15) / 5)
  const p = pop(f, 9)
  return (
    <Scene duration={120}>
      <Brand />
      <Pulse f={f} cy={1150} />
      <div
        style={at(78, 270, { fontSize: 135, lineHeight: 0.99, letterSpacing: -8, fontWeight: 600 })}
      >
        <Word>Your next</Word>
        <Word delay={9}>rep starts</Word>
        <Word delay={18}>here.</Word>
      </div>
      <div
        style={at(175, 905, {
          width: 730,
          height: 490,
          transform: `translateY(${(1 - p) * 400 + Math.sin(f / 9) * 16}px) rotate(${-25 + Math.sin(f / 18) * 7}deg) scale(${p * (1 + beat * 0.045)})`,
        })}
      >
        <div className="bar" />
        {[0, 1].map((side) => (
          <React.Fragment key={side}>
            <div className="plate outer" style={{ left: side ? 622 : 18 }} />
            <div className="plate inner" style={{ left: side ? 542 : 96 }} />
          </React.Fragment>
        ))}
      </div>
      <div style={at(80, 1570, { fontSize: 32, color: C.muted })}>
        Find your rhythm. Build your strength.
      </div>
      <div className="beat-bars">
        {Array.from({ length: 35 }, (_, i) => (
          <i
            key={i}
            style={{
              height: 10 + Math.abs(Math.sin(f / 7 + i * 0.6)) * 47,
              background: i % 5 === 0 ? C.blush : C.lilac,
            }}
          />
        ))}
      </div>
    </Scene>
  )
}
function Plan() {
  const f = useCurrentFrame()
  const selected = Math.min(5, Math.floor(Math.max(0, f - 15) / 15))
  return (
    <Scene color={C.lilac} duration={150}>
      <Brand dark />
      <div className="headline dark">
        <Word>A little plan.</Word>
        <Word delay={7}>A lot of momentum.</Word>
      </div>
      <div style={at(78, 475, { display: 'flex', gap: 14 })}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div
            key={i}
            style={{
              width: 118,
              height: 126,
              borderRadius: 36,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              background: i === selected ? C.plum : '#cfbfdc',
              color: i === selected ? C.white : C.plum,
              transform: `translateY(${(1 - pop(f, 12 + i * 4)) * 90 - (i === selected ? 12 : 0)}px)`,
              fontSize: 25,
            }}
          >
            {d}
            <span style={{ fontSize: 33 }}>{12 + i}</span>
          </div>
        ))}
      </div>
      <Phone screen="home" f={f} x={285} y={665} w={470} rotate={-6} />
      <div
        className="floating dark"
        style={at(510, 1160, { transform: `translateX(${(1 - pop(f, 45)) * 600}px) rotate(7deg)` })}
      >
        <Mark size={43} />
        <span>
          Your week.
          <br />
          <b>Your pace.</b>
        </span>
      </div>
      <Caption dark>Make room for the next session.</Caption>
    </Scene>
  )
}
function Check({ done }) {
  return (
    <div
      style={{
        width: 70,
        height: 70,
        border: `2px solid ${done ? C.lilac : '#756380'}`,
        background: done ? C.lilac : 'transparent',
        borderRadius: 22,
        display: 'grid',
        placeItems: 'center',
        color: C.plum,
        fontSize: 45,
        transform: `scale(${done ? 1.06 : 1})`,
      }}
    >
      {done ? '✓' : ''}
    </div>
  )
}
function Log() {
  const f = useCurrentFrame()
  const count = [45, 75, 105].filter((n) => f >= n).length
  const rest = pop(f, 120)
  const ring = ramp(f, 120, 177, 0, 0.7)
  return (
    <Scene duration={180}>
      <Brand />
      <div className="headline">
        <Word>One more rep.</Word>
        <Word delay={7}>One step stronger.</Word>
      </div>
      <div
        style={at(78, 585, {
          width: 924,
          background: C.panel,
          borderRadius: 52,
          padding: 48,
          transform: `translateY(${(1 - pop(f, 8)) * 300}px) rotate(${ramp(f, 0, 45, -3, 0)}deg)`,
        })}
      >
        <div style={{ fontSize: 27, color: C.muted, marginBottom: 14 }}>Workout in progress</div>
        <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: -1 }}>Upper body strength</div>
        <div
          style={{
            margin: '32px 0',
            height: 9,
            borderRadius: 10,
            background: '#5a4865',
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${(count / 6) * 100}%`, height: '100%', background: C.lilac }} />
        </div>
        <div style={{ fontSize: 31, margin: '35px 0 28px' }}>Barbell bench press</div>
        <div className="set-grid labels">
          <span>Set</span>
          <span>kg</span>
          <span>Reps</span>
          <span>Done</span>
        </div>
        {[0, 1, 2].map((i) => (
          <div
            className="set-grid"
            key={i}
            style={{
              transform: `translateX(${(1 - pop(f, 15 + i * 6)) * 200}px)`,
              opacity: ramp(f, 15 + i * 6, 25 + i * 6),
            }}
          >
            <span style={{ color: C.muted }}>{i + 1}</span>
            <span className="input">70</span>
            <span className="input">8</span>
            <Check done={count > i} />
          </div>
        ))}
        <div style={{ marginTop: 27, fontSize: 25, color: C.muted }}>
          {count} of 6 sets complete
        </div>
      </div>
      <div
        style={at(170, 1325, {
          width: 740,
          height: 260,
          borderRadius: 45,
          background: C.lilac,
          color: C.plum,
          display: 'flex',
          alignItems: 'center',
          padding: 38,
          gap: 32,
          boxShadow: '0 30px 60px #140b2233',
          transform: `translateY(${(1 - rest) * 420}px) rotate(-4deg)`,
          opacity: ramp(f, 118, 125),
        })}
      >
        <svg width="165" height="165" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#c6b8d0" strokeWidth="5" />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={C.plum}
            strokeWidth="5"
            strokeDasharray="264"
            strokeDashoffset={264 * ring}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
          />
          <text
            x="50"
            y="59"
            textAnchor="middle"
            fill={C.plum}
            fontSize="25"
            fontFamily="DM"
            fontWeight="600"
          >{`1:${String(30 - Math.floor(Math.max(0, f - 120) / 6)).padStart(2, '0')}`}</text>
        </svg>
        <div>
          <div style={{ fontSize: 38, fontWeight: 600 }}>Take a breath.</div>
          <div style={{ fontSize: 27, marginTop: 10 }}>Your next set is coming.</div>
        </div>
      </div>
      <Caption>Log your sets. Keep your flow.</Caption>
    </Scene>
  )
}
function Progress() {
  const f = useCurrentFrame()
  const p = ramp(f, 20, 110)
  const value = Math.round(60 + p * 10)
  const points = [
    [0, 280],
    [115, 280],
    [230, 220],
    [345, 220],
    [460, 155],
    [575, 155],
    [690, 65],
    [820, 15],
  ]
  const path = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  return (
    <Scene color={C.blush} duration={180}>
      <Brand dark />
      <div className="headline dark">
        <Word>Small wins.</Word>
        <Word delay={7}>Real progress.</Word>
      </div>
      <div style={at(78, 605, { color: C.plum })}>
        <div style={{ fontSize: 30 }}>Barbell bench press</div>
        <div style={{ fontSize: 170, lineHeight: 1.25, letterSpacing: -10, fontWeight: 600 }}>
          {value}
          <span style={{ fontSize: 42, letterSpacing: 0, marginLeft: 20 }}>kg</span>
        </div>
      </div>
      <div style={at(115, 910, { width: 850, height: 370 })}>
        <svg viewBox="-15 -30 865 370" width="850" height="370">
          {[80, 180, 280].map((y) => (
            <path key={y} d={`M0 ${y}H820`} stroke="#cfbac9" strokeWidth="2" />
          ))}
          <path d={`${path}L820 315H0Z`} fill="#624572" opacity={0.06} clipPath="url(#reveal)" />
          <defs>
            <clipPath id="reveal">
              <rect x="-15" y="-30" width={850 * p} height="400" />
            </clipPath>
          </defs>
          <path
            d={path}
            fill="none"
            stroke={C.plum}
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={1 - p}
          />
          {points.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i === 7 ? 13 : 6}
              fill={C.plum}
              opacity={ramp(p, i / 8, (i + 0.3) / 8)}
            />
          ))}
        </svg>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: '#76627e',
            fontSize: 26,
          }}
        >
          <span>7 Sep</span>
          <span>17 Oct</span>
        </div>
      </div>
      <div style={at(78, 1410, { display: 'flex', gap: 24, color: C.plum })}>
        {[
          ['+10 kg', 'in 6 weeks'],
          ['Every session', 'adds up'],
        ].map(([a, b], i) => (
          <div
            key={a}
            style={{
              width: 450,
              padding: 32,
              borderRadius: 32,
              background: i ? C.lilac : '#e4c8d3',
              transform: `translateY(${(1 - pop(f, 80 + i * 10)) * 250}px)`,
            }}
          >
            <div style={{ fontSize: 39, fontWeight: 600 }}>{a}</div>
            <div style={{ fontSize: 26, marginTop: 8 }}>{b}</div>
          </div>
        ))}
      </div>
      <Caption dark>See the work become a habit.</Caption>
    </Scene>
  )
}
function Local() {
  const f = useCurrentFrame()
  const p = pop(f, 10)
  return (
    <Scene duration={150}>
      <Brand />
      <div className="headline">
        <Word>Your training.</Word>
        <Word delay={7}>Yours to keep.</Word>
      </div>
      <Pulse f={f} cy={1080} />
      <div
        style={at(350, 740, {
          width: 380,
          height: 650,
          borderRadius: 65,
          border: `5px solid ${C.muted}`,
          background: C.panel,
          transform: `perspective(1400px) rotateY(${18 + Math.sin(f / 35) * 8}deg) rotate(-9deg) scale(${p})`,
          boxShadow: '30px 50px 70px #160b2545',
        })}
      >
        <div
          style={at(137, 28, { width: 100, height: 12, borderRadius: 10, background: C.muted })}
        />
        <svg
          style={at(93, 205)}
          width="190"
          height="220"
          viewBox="0 0 100 115"
          fill="none"
          stroke={C.lilac}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M50 8L87 24v33c0 23-19 40-37 49C32 97 13 80 13 57V24Z" />
          <path
            d="m31 57 13 13 26-28"
            strokeDasharray="80"
            strokeDashoffset={80 * (1 - ramp(f, 25, 60))}
          />
        </svg>
      </div>
      {[
        ['Plans', 70, 900, -10],
        ['Sessions', 690, 1020, 8],
        ['Progress', 115, 1380, -5],
      ].map(([s, x, y, r], i) => (
        <div
          key={s}
          style={at(x, y, {
            borderRadius: 28,
            padding: '28px 37px',
            background: i === 1 ? C.blush : C.lilac,
            color: C.plum,
            fontSize: 32,
            boxShadow: '0 20px 50px #160b2522',
            transform: `translateY(${(1 - pop(f, 24 + i * 10)) * 350 + Math.sin(f / 17 + i) * 12}px) rotate(${r}deg)`,
          })}
        >
          {s} <span style={{ marginLeft: 20 }}>✓</span>
        </div>
      ))}
      <div style={at(78, 1610, { fontSize: 41, fontWeight: 600 })}>
        On your phone. In your control.
      </div>
      <Caption>No account. No cloud sync.</Caption>
    </Scene>
  )
}
function Finale() {
  const f = useCurrentFrame()
  const p = pop(f, 4)
  const beat = Math.exp(-(f % 15) / 5)
  return (
    <Scene color={C.lilac} duration={200}>
      <Pulse f={f} color={C.plum} cy={720} />
      <div
        style={at(330, 420, {
          width: 420,
          height: 420,
          borderRadius: 100,
          background: C.plum,
          display: 'grid',
          placeItems: 'center',
          boxShadow: '0 35px 65px #2d22352b',
          transform: `rotate(${-9 + Math.sin(f / 24) * 4}deg) scale(${p * (1 + beat * 0.025)})`,
        })}
      >
        <Img src={staticFile('icon.png')} style={{ width: 420, height: 420, borderRadius: 100 }} />
      </div>
      <div
        style={at(60, 965, {
          width: 960,
          textAlign: 'center',
          fontSize: 117,
          lineHeight: 1.05,
          letterSpacing: -7,
          fontWeight: 600,
          color: C.plum,
        })}
      >
        <Word delay={14}>active next</Word>
      </div>
      <div style={at(100, 1150, { width: 880, textAlign: 'center', fontSize: 40, color: C.plum })}>
        <Word delay={24}>Find your training rhythm.</Word>
      </div>
      <div
        style={at(265, 1395, {
          width: 550,
          padding: '32px 0',
          borderRadius: 60,
          textAlign: 'center',
          background: C.plum,
          color: C.white,
          fontSize: 35,
          transform: `scale(${pop(f, 38)})`,
        })}
      >
        Make your next rep count.
      </div>
      <div
        style={at(0, 1740, { width: '100%', textAlign: 'center', fontSize: 26, color: '#76627e' })}
      >
        Your training. Your phone.
      </div>
    </Scene>
  )
}
export function CadenceAlive() {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: C.plum, color: C.white, fontFamily: 'DM, sans-serif' }}>
      <Sequence from={0} durationInFrames={120}>
        <Intro />
      </Sequence>
      <Sequence from={120} durationInFrames={150}>
        <Plan />
      </Sequence>
      <Sequence from={270} durationInFrames={180}>
        <Log />
      </Sequence>
      <Sequence from={450} durationInFrames={180}>
        <Progress />
      </Sequence>
      <Sequence from={630} durationInFrames={150}>
        <Local />
      </Sequence>
      <Sequence from={780} durationInFrames={180}>
        <Finale />
      </Sequence>
      {[120, 270, 450, 630, 780].map((start, i) => (
        <Sequence key={start} from={start - 10} durationInFrames={20}>
          <Wipe color={[C.lilac, C.plum, C.blush, C.plum, C.lilac][i]} />
        </Sequence>
      ))}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: 5,
          width: `${(f / 959) * 100}%`,
          background: C.lilac,
          opacity: 0.45,
        }}
      />
      <Html5Audio src={staticFile('soundtrack.wav')} />
    </AbsoluteFill>
  )
}
function Wipe({ color }) {
  const f = useCurrentFrame()
  const p = interpolate(f, [0, 19], [0, 1], { easing: Easing.inOut(Easing.cubic), ...clamp })
  return (
    <AbsoluteFill
      style={{
        background: color,
        transform: `translateX(${interpolate(p, [0, 0.5, 1], [-115, 0, 115])}%) skewX(-12deg)`,
      }}
    />
  )
}
