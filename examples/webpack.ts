import path from 'path';
import webpack from 'webpack';

const configuration: webpack.Configuration = {
  mode: 'production',
  target: 'node',
  entry: path.join(__dirname, 'echo.ts'),
  output: {
    path: path.join(__dirname),
    filename: "echo.bundle.js",
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            // Remove this line to enable type checking in webpack builds
            transpileOnly: true,
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.json', '.ts'],
  },
  optimization: {
    minimize: false
  },
  /**
   * Disables webpack processing of __dirname and __filename.
   * If you run the bundle in node.js it falls back to these values of node.js.
   * https://github.com/webpack/webpack/issues/2010
   */
  node: {
    __dirname: false,
    __filename: false,
  },
};

export default configuration;
