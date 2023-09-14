"use strict";

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: {
    content: "./src/content.js",
    pageWorld: "@inboxsdk/core/pageWorld.js",
    background: "./src/background.js",
    page: "./src/page.js",
  },
  module: {
    rules: [
      {
        test: /\.m?jsx?$/,
        enforce: "pre",
        use: ["source-map-loader"],
      },
    ],
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: "static" }],
    }),
  ],
};
