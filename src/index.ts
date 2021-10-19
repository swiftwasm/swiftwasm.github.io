import CodeMirror from "codemirror";

import "codemirror/mode/swift/swift";
import "codemirror/lib/codemirror.css";

const kCompileApi =
  "https://us-central1-swiftwasm-zhuowei.cloudfunctions.net/compile/v1/compile";
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

interface CompilationResult {
  output: {
    success: boolean;
    output: string;
  };
  binary?: ArrayBuffer;
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
    if (compileResult.output.success) {
      runWasm(compileResult.binary);
    }
  } catch (e) {
    console.log(e);
  }
  runButton.disabled = false;
}

async function compileCode(code: string) {
  if (kPrecompiledDemo && code.trim() == kDefaultDemoScript.trim()) {
    return await getPrecompiledDemo();
  }
  const fetchResult = await fetch(kCompileApi, {
    method: "POST",
    body: JSON.stringify({
      src: code,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const resultBuffer = await fetchResult.arrayBuffer();
  return parseResultBuffer(resultBuffer);
}

function parseResultBuffer(resultBuffer: ArrayBuffer): CompilationResult {
  const textDecoder = new TextDecoder("utf-8");
  let uint32View = null;
  if (resultBuffer.byteLength >= 8) {
    uint32View = new Uint32Array(resultBuffer.slice(0, 8));
  }
  if (uint32View == null || uint32View[0] != 0xdec0ded0) {
    return {
      output: { success: false, output: textDecoder.decode(resultBuffer) },
    };
  }
  const jsonLength = uint32View[1];
  const jsonBuffer = resultBuffer.slice(8, 8 + jsonLength);
  let output: CompilationResult = {
    output: JSON.parse(textDecoder.decode(jsonBuffer)),
  };
  if (8 + jsonLength < resultBuffer.byteLength) {
    output.binary = resultBuffer.slice(8 + jsonLength);
  }
  return output;
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
  const output = compileResult.output;
  outputArea.textContent = output.output;
  downloadWasmButton.style.display = output.success ? "" : "none";
  if (compileResult.binary) {
    const blob = new Blob([compileResult.binary], { type: "application/wasm" });
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

async function getPrecompiledDemo() {
  const fetchResult = await fetch("/demo_compiled/program.wasm.txt");
  const resultBuffer = await fetchResult.arrayBuffer();
  return {
    output: {
      success: true,
      output: "",
    },
    binary: resultBuffer,
  };
}

// Demo script
const kDefaultDemoScript = `import Glibc

print("Hello, 🌐!")

// we can try loops and arithmetic:

func fizzBuzz(from: Int, to: Int) {
  for i in from...to {
    if i % 15 == 0 {
      print("FizzBuzz")
    } else if i % 3 == 0 {
      print("Fizz")
    } else if i % 5 == 0 {
      print("Buzz")
    } else {
      print(i)
    }
  }
}

fizzBuzz(from: 1, to: 20)

func fib(n: Int) -> Int {
  if n <= 0 { return 0 }
  if n <= 2 { return 1 }
  var a = 1;
  var b = 1;
  for _ in 3...n {
    let newA = b
    let newB = a + b
    a = newA
    b = newB
  }
  return b
}

print("The 10th Fibonacci number is \\(fib(n: 10))")

// we can also run JavaScript from Swift.

@_silgen_name("executeScript")
func executeScript(script: UnsafePointer<UInt8>, length: Int32)

// Here's a string holding JavaScript code, with some string interpolation:
var scriptSrc = "alert('Hello from Swift! The 11th Fibonacci number is \\(fib(n: 11))');"
// and we can execute it.
scriptSrc.withUTF8 { bufferPtr in
  executeScript(script: bufferPtr.baseAddress!, length: Int32(bufferPtr.count))
}
`;

pageLoaded();
