import { readFileSync } from 'node:fs';
import { MeshoptDecoder } from 'meshoptimizer';

// Decode the shipped bytes, including filtered/quantized animation accessors.
export async function readRuntimeGlb(file) {
  await MeshoptDecoder.ready;
  const bytes = readFileSync(file);
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB');
  const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.toString('utf8', 20, 20 + length));
  const binary = bytes.subarray(28 + length), views = [];
  for (const view of json.bufferViews) {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (ext) {
      const decoded = new Uint8Array(ext.count * ext.byteStride);
      MeshoptDecoder.decodeGltfBuffer(decoded, ext.count, ext.byteStride, binary.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength), ext.mode, ext.filter);
      views.push(decoded);
    } else views.push(binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
  }
  const readAccessor = (index) => {
    const a = json.accessors[index], source = views[a.bufferView], b = json.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    const getter = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    const divisor = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535, 5125: 4294967295 }[a.componentType];
    const data = new DataView(source.buffer, source.byteOffset, source.byteLength);
    return Array.from({ length: a.count }, (_, row) => Array.from({ length: n }, (_, col) => {
      const value = data[getter]((a.byteOffset ?? 0) + row * (b.byteStride ?? n * size) + col * size, true);
      return a.normalized ? Math.max(-1, value / divisor) : value;
    }));
  };
  return { json, bytes, readAccessor };
}
