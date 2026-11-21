import { readFile, writeFile } from 'node:fs/promises';

// Capacitor Camera 7.0.5 asks for full-library access even though PHPicker only
// needs the user-selected item providers. Keep camera and gallery-save permission
// behavior intact. Fail closed on dependency changes so this patch is reviewed.
const root = new URL('../', import.meta.url);
const packageUrl = new URL('node_modules/@capacitor/camera/package.json', root);
const { version } = JSON.parse(await readFile(packageUrl, 'utf8'));
if (version !== '7.0.5') throw new Error(`Review iOS photo picker patch for Camera ${version}`);
const file = new URL('node_modules/@capacitor/camera/ios/Sources/CameraPlugin/CameraPlugin.swift', root);
const marker = '// NAVA: PHPicker grants access only to explicitly selected items.';
let source = await readFile(file, 'utf8');
if (!source.includes(marker)) {
  const start = source.indexOf('    func showPhotos() {');
  const end = source.indexOf('    func presentCameraPicker()', start);
  const oldBody = source.slice(start, end);
  const configuration = 'PHPickerConfiguration(photoLibrary: PHPhotoLibrary.shared())';
  if (start < 0 || end < 0 || !oldBody.includes('PHPhotoLibrary.requestAuthorization') || !source.includes(configuration)) {
    throw new Error('Unexpected Camera source; photo picker patch was not applied.');
  }
  source = source.slice(0, start) + `    func showPhotos() {
        ${marker}
        presentSystemAppropriateImagePicker()
    }

` + source.slice(end);
  // No PHAsset identifiers: read the chosen files through NSItemProvider only.
  source = source.replace(configuration, 'PHPickerConfiguration()');
  await writeFile(file, source);
}
const body = source.slice(source.indexOf('    func showPhotos() {'), source.indexOf('    func presentCameraPicker()'));
if (body.includes('PHPhotoLibrary') || !body.includes('presentSystemAppropriateImagePicker()') || source.includes('PHPickerConfiguration(photoLibrary:')) {
  throw new Error('Photo picker permission boundary verification failed.');
}
console.log('iOS PHPicker uses selected-item access; camera/gallery-save permissions unchanged.');
