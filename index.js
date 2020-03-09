import { SwiftRuntime } from "javascript-kit-swift";
import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";
;

window.swiftExports = {
  execWasm: async (uint8Array) => {
    const wasmFs = new WasmFs();
    const outputArea = document.getElementById("output-area")

    wasmFs.volume.fds[1].node.write = (stdoutBuffer) => {
      const text = new TextDecoder("utf-8").decode(stdoutBuffer);
      console.log(text)
      outputArea.textContent += text + "\n";
      outputArea.scrollTop = element.scrollHeight; // focus on bottom
      return stdoutBuffer.length;
    } 

    wasmFs.volume.fds[2].node.write = (stderrBuffer) => {
      const text = new TextDecoder("utf-8").decode(stderrBuffer);
      console.error(text)
      return stdoutBuffer.length;
    } 
    const wasi = new WASI({
      bindings: {
        ...WASI.defaultBindings,
        fs: wasmFs.fs
      }
    });

    const importObject = {
      executeScript: (script, length) => {
        console.log(this)
      }
    }

    const { instance } = await WebAssembly.instantiate(uint8Array, {
      wasi_snapshot_preview1: wasi.wasiImport,
      wasi_unstable: wasi.wasiImport,
      ...importObject,
    });

    importObject.instance = instance
  
    wasi.start(instance);
  }
}

const swift = new SwiftRuntime();
// Instantiate a new WASI Instance
const wasmFs = new WasmFs();
wasmFs.volume.fds[1].node.write = (stdoutBuffer) => {
  const text = new TextDecoder("utf-8").decode(stdoutBuffer);
  console.log(text)
  return stdoutBuffer.length;
} 
wasmFs.volume.fds[2].node.write = (stdoutBuffer) => {
  const text = new TextDecoder("utf-8").decode(stdoutBuffer);
  throw new Error(text)
} 
let wasi = new WASI({
  bindings: {
    ...WASI.defaultBindings,
    fs: wasmFs.fs
  }
});

const startWasiTask = async () => {
  // Fetch our Wasm File
  const response = await fetch("./dist/App.wasm");
  const responseArrayBuffer = await response.arrayBuffer();

  // Instantiate the WebAssembly file
  const wasm_bytes = new Uint8Array(responseArrayBuffer).buffer;
  const { instance } = await WebAssembly.instantiate(wasm_bytes, {
    wasi_snapshot_preview1: wasi.wasiImport,
    javascript_kit: swift.importObjects(),
  });

  swift.setInsance(instance);
  // Start the WebAssembly WASI instance!
  wasi.start(instance);
};
startWasiTask();
