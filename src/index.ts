import CodeMirror from "codemirror";

import "codemirror/mode/swift/swift";
import "codemirror/lib/codemirror.css";
import kDefaultDemoScript from './demo.swift?raw';

const kCompileApi = "https://swiftwasm-compiler-api-mgv5x4syda-uc.a.run.app";
const kPrecompiledDemo = true;

const kDownloadUrls: {
  macos: string[];
  linux: string[];
  windows?: string[];
} = {
  macos: ["macOS", "https://github.com/swiftwasm/swift/releases"],
  linux: ["Linux", "https://github.com/swiftwasm/swift/releases"],
};

var codeMirror: any = null;
var runButton: HTMLButtonElement | null = null;
var outputArea: HTMLElement | null = null;
var downloadWasmButton: HTMLAnchorElement | null = null;
var currentDownloadURL: string | null = null;

type CompilationResult = {
  success: true,
  binary: ArrayBuffer,
} | {
  success: false;
  output: string;
}

function writeOutputArea(text: string) {
  var element = document.getElementById("output-area");
  if (arguments.length > 1)
    text = Array.prototype.slice.call(arguments).join(" ");
  console.log(text);
  if (element) {
    element.textContent += text;
    element.scrollTop = element.scrollHeight; // focus on bottom
  }
}

function pageLoaded() {
  const codeArea = document.getElementById("code-area") as HTMLTextAreaElement;
  codeArea.disabled = false;
  if (codeArea.value == "") {
    codeArea.value = kDefaultDemoScript;
  }
  codeMirror = CodeMirror.fromTextArea(codeArea, {
    mode: "swift",
    indentUnit: 4,
    lineNumbers: true,
  });
  codeMirror.setSize("100%", "500px");
  runButton = document.getElementById("code-run") as HTMLButtonElement;
  runButton.addEventListener("click", runClicked);
  outputArea = document.getElementById("output-area");
  downloadWasmButton = document.getElementById(
    "code-download-wasm"
  ) as HTMLAnchorElement;
  setupDownloadArea();
  (document.getElementById("emaillink") as HTMLAnchorElement).href =
    "mailto:" + atob("aGVsbG9Ac3dpZnR3YXNtLm9yZw==");
}

async function runClicked() {
  runButton.disabled = true;
  downloadWasmButton.style.display = "none";
  outputArea.textContent = "Compiling...";
  if (currentDownloadURL) {
    URL.revokeObjectURL(currentDownloadURL);
  }
  const code = codeMirror.getValue();
  try {
    const compileResult = await compileCode(code);
    populateResultsArea(compileResult);
    if (compileResult.success) {
      runWasm(compileResult.binary);
    }
  } catch (e) {
    console.log(e);
  }
  runButton.disabled = false;
}

async function compileCode(code: string): Promise<CompilationResult> {
  if (kPrecompiledDemo && code.trim() == kDefaultDemoScript.trim()) {
    return await getPrecompiledDemo();
  }
  const fetchResult = await fetch(kCompileApi, {
    method: "POST",
    body: JSON.stringify({
      mainCode: code,
      action: "emitExecutable"
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (fetchResult.ok) {
    const resultBuffer = await fetchResult.arrayBuffer();
    return { binary: resultBuffer, success: true };
  } else {
    type CompileApiError = {
      stderr: string;
      statusCode: number;
    }
    const error: CompileApiError = await fetchResult.json();
    return { success: false, output: error.stderr };
  }
}

async function runWasm(wasmBuffer: ArrayBuffer) {
  writeOutputArea("Running WebAssembly...\n");
  const { WasmFs } = await import("@wasmer/wasmfs");

  const wasmFs = new WasmFs();
  const decoder = new TextDecoder("utf-8");

  wasmFs.volume.fds[1].node.write = (stdoutBuffer: BufferSource) => {
    const text = decoder.decode(stdoutBuffer);
    writeOutputArea(text);
    return stdoutBuffer.byteLength;
  };

  wasmFs.volume.fds[2].node.write = (stderrBuffer: BufferSource) => {
    const text = decoder.decode(stderrBuffer);
    console.error(text);
    return stderrBuffer.byteLength;
  };

  const { WASI } = await import("@wasmer/wasi");
  const wasi = new WASI({
    bindings: {
      ...WASI.defaultBindings,
      fs: wasmFs.fs,
    },
  });

  let _instance: WebAssembly.Instance;
  const importObject = {
    env: {
      executeScript: (ptr: number, len: number) => {
        const uint8Memory = new Uint8Array(
          (_instance.exports.memory as any).buffer
        );
        const script = decoder.decode(uint8Memory.subarray(ptr, ptr + len));
        new Function(script)();
      },
    },
  };

  const { instance } = await WebAssembly.instantiate(wasmBuffer, {
    wasi_snapshot_preview1: wasi.wasiImport,
    wasi_unstable: wasi.wasiImport,
    ...importObject,
  });

  _instance = instance;
  wasi.start(instance);
}

function populateResultsArea(compileResult: CompilationResult) {
  console.log(compileResult);
  const output = compileResult;
  if (output.success === false) {
    outputArea.textContent = output.output;
  } else {
    outputArea.textContent = "";
  }
  downloadWasmButton.style.display = output.success ? "" : "none";
  if (output.success) {
    const blob = new Blob([output.binary], { type: "application/wasm" });
    currentDownloadURL = URL.createObjectURL(blob);
    downloadWasmButton.href = currentDownloadURL;
  }
}

function setupDownloadArea() {
  const downloadButton = document.getElementById(
    "download-button"
  ) as HTMLAnchorElement;
  const platform = detectPlatform();
  const isWindows = platform == "windows";
  const platformActual = isWindows ? "linux" : platform;
  const platformName = isWindows ? "Windows" : kDownloadUrls[platformActual][0];
  const downloadUrl = kDownloadUrls[platformActual][1];
  downloadButton.textContent = "Download for " + platformName;
  downloadButton.href = downloadUrl;
  if (isWindows) {
    document.getElementById("windows-wsl").textContent =
      "Requires Windows Subsystem for Linux. ";
  }
}

function detectPlatform() {
  const userAgent = navigator.userAgent;
  if (userAgent.indexOf("Mac OS X") != -1) {
    return "macos";
  }
  if (userAgent.indexOf("Windows") != -1) {
    return "windows";
  }
  return "linux";
}

async function getPrecompiledDemo(): Promise<CompilationResult> {
  const fetchResult = await fetch("/demo_compiled/program.wasm.txt");
  const resultBuffer = await fetchResult.arrayBuffer();
  return {
    success: true,
    binary: resultBuffer,
  };
}


pageLoaded();
