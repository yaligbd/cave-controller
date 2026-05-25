const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// Tell Metro to recognize both .bin and .c files as raw assets
config.resolver.assetExts.push('bin', 'c');

module.exports = config;