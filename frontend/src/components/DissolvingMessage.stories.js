import DissolvingMessage from './DissolvingMessage';

export default {
  title: 'Components/DissolvingMessage',
  component: DissolvingMessage,
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#0a0a0f' }],
    },
  },
  argTypes: {
    text: { control: 'text' },
    dissolve: { control: 'boolean' },
    density: {
      control: { type: 'range', min: 1, max: 15, step: 1 },
    },
    drift: {
      control: { type: 'range', min: 0.1, max: 5, step: 0.1 },
    },
    duration: {
      control: { type: 'range', min: 1, max: 15, step: 0.5 },
    },
    textFade: {
      control: { type: 'range', min: 0.2, max: 2, step: 0.1 },
    },
    fadeVariation: {
      control: { type: 'range', min: 0, max: 1, step: 0.05 },
    },
    shimmer: {
      control: { type: 'range', min: 0, max: 1, step: 0.05 },
    },
    wind: {
      control: { type: 'range', min: -2, max: 2, step: 0.05 },
    },
    gravity: {
      control: { type: 'range', min: 0, max: 20, step: 0.5 },
    },
    plumeSize: {
      control: { type: 'range', min: 0, max: 30, step: 1 },
    },
    curlFreq: {
      control: { type: 'range', min: 0, max: 5, step: 0.1 },
    },
    airResistance: {
      control: {
        type: 'range',
        min: 0.9,
        max: 0.999,
        step: 0.001,
      },
    },
    directionMix: {
      control: { type: 'range', min: 0, max: 1, step: 0.05 },
    },
    particleSizeMax: {
      control: { type: 'range', min: 0.3, max: 3, step: 0.1 },
    },
  },
};

export const Default = {
  args: {
    text:
      'Every testimony carries the weight of a thousand ' +
      'unspoken words. In the silence between sentences, ' +
      'entire worlds collapse and reform.',
    dissolve: false,
    density: 4,
    drift: 3.0,
    duration: 4,
    textFade: 0.5,
    fadeVariation: 0.3,
    shimmer: 0.4,
    wind: -0.15,
    gravity: 3,
    plumeSize: 8,
    curlFreq: 1.2,
    airResistance: 0.985,
    directionMix: 0.7,
    particleSizeMax: 1.2,
  },
};

export const Dissolving = {
  args: {
    ...Default.args,
    dissolve: true,
  },
};

export const ShortMessage = {
  args: {
    ...Default.args,
    text: 'We remember.',
    dissolve: true,
  },
};

export const SlowDissolve = {
  args: {
    ...Default.args,
    dissolve: true,
    duration: 10,
    drift: 1.5,
    textFade: 1.5,
  },
};
