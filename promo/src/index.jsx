import React from 'react'
import { registerRoot, Composition } from 'remotion'
import { CadenceAlive } from './video'

registerRoot(() => (
  <Composition
    id="CadenceAlive"
    component={CadenceAlive}
    durationInFrames={960}
    fps={30}
    width={1080}
    height={1920}
  />
))
