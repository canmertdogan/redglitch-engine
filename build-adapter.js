const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src-android/adapter.js'],
  bundle: true,
  outfile: 'public/js/android-adapter.bundle.js',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
}).then(() => {
    console.log('Build complete: public/js/android-adapter.bundle.js');
}).catch(() => process.exit(1));
