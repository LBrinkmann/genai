module.exports = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-controls',
  ],
  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },
  typescript: {
    reactDocgen: false,
  },
  webpackFinal: async (config) => {
    // Add babel-loader for JS/JSX files (CRA-style)
    config.module.rules.push({
      test: /\.(js|jsx)$/,
      exclude: /node_modules/,
      use: {
        loader: require.resolve('babel-loader'),
        options: {
          presets: [
            require.resolve('@babel/preset-env'),
            [
              require.resolve('@babel/preset-react'),
              { runtime: 'automatic' },
            ],
          ],
        },
      },
    });
    return config;
  },
};
