class Async<T> {
    typealias Subscriber = (T) -> Void

    private let f: (@escaping Subscriber) -> Void
    init(_ f: @escaping (@escaping Subscriber) -> Void) {
        self.f = f
    }

    func subscribe(_ subscriber: @escaping Subscriber) {
        f(subscriber)
    }

    func map<U>(_ transformer: @escaping (T) -> U) -> Async<U> {
        Async<U> { resolver in
            self.subscribe { value in
                resolver(transformer(value))
            }
        }
    }

    func flatMap<U>(_ transformer: @escaping (T) -> Async<U>) -> Async<U> {
        Async<U> { resolver in
            self.subscribe { valueT in
                transformer(valueT).subscribe { valueU in
                    resolver(valueU)
                }
            }
        }
    }

    static func just(_ value: T) -> Async<T> {
        Async { $0(value) }
    }
}

extension Async where T == Result<JSValue, Error> {

    static func fromPromise(_ promise: JSObjectRef) -> Async {
        Async<Result<JSValue, Error>> { resolver in
            _ = promise
                .then!(JSFunctionRef.from({ arguments -> JSValue in
                    let value = arguments[0]
                    resolver(.success(value))
                    return .undefined
                }))
                .object!
                .catch!(JSFunctionRef.from({ arguments -> JSValue in
                    let error = arguments[0].object!
                    resolver(.failure(MessageError(message: error.message.string!)))
                    return .undefined
                }))
        }
    }
}

import JavaScriptKit

let kDefaultDemoScript = """
import Glibc

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

func executeScript(script: String) {
    let magicFd:Int32 = -1337
    if write(magicFd, script, strlen(script)) == -1 {
        print("Can't execute script: please use the SwiftWasm polyfill on https://swiftwasm.org.")
        print(script)
    }
}

// Here's a string holding JavaScript code, with some string interpolation:
let scriptSrc = "alert('Hello from Swift! The 11th Fibonacci number is \\(fib(n: 11))');"
// and we can execute it.
executeScript(script: scriptSrc)
"""

struct JSArrayBuffer: JSValueConvertible {
    private let ref: JSObjectRef
    init(_ ref: JSObjectRef) {
        self.ref = ref
    }

    var byteLength: Int32 {
        ref.byteLength.number!
    }

    func slice(from begin: Int, to end: Int? = nil) -> [UInt8] {
        let sliced: JSObjectRef = {
            if let end = end {
                return ref.slice!(begin, end).object!
            } else {
                return ref.slice!(begin).object!
            }
        }()
        let count = Int(sliced.length.number!)
        var buffer = [UInt8]()
        buffer.reserveCapacity(count)
        for index in 0..<count {
            buffer.append(UInt8(bitPattern: Int8(sliced[index].number!)))
        }
        return buffer
    }

    func jsValue() -> JSValue {
        .object(ref)
    }
}

struct MessageError: Error {
    let message: String
}

func fetch(_ url: String, _ options: [String: JSValueConvertible] = [:]) -> Async<Result<JSArrayBuffer, Error>> {
    let jsFetch = JSObjectRef.global.fetch.function!
    let promise = jsFetch(url, options).object!
    return Async.fromPromise(promise).map {
        $0.map { response in
            let buffer = response.object!.arrayBuffer!().object!
            return JSArrayBuffer(buffer)
        }
    }
}

enum JSON {
    private static let object = JSObjectRef.global.JSON.object!
    static func stringify(_ dictionary: [String: String]) -> String {
        object.stringify!(dictionary.jsValue()).string!
    }

    static func parse(_ string: String) -> JSObjectRef {
        object.parse!(string).object!
    }
}

class CompilerService {
    enum Response {
        case success(binary: [UInt8], output: String)
        case failure(output: String)

        var output: String {
            switch self {
            case .success(_, let output),
                 .failure(let output):
                return output
            }
        }
    }
    let endpoint = "https://us-central1-swiftwasm-zhuowei.cloudfunctions.net/compile/v1/compile"
    let precompiledDemo = "/demo_compiled/program.wasm.txt"

    func compile(_ code: String) -> Async<Result<Response, Error>> {
        if code == kDefaultDemoScript {
            return fetch(precompiledDemo).map { result in
                result.map { arrayBuffer -> Response in
                    .success(
                        binary: arrayBuffer.slice(from: 0),
                        output: ""
                    )
                }
            }
        }
        return fetch(
            endpoint, [
                "method": "POST",
                "body": JSON.stringify(["src": code]),
                "headers": [
                    "Content-Type": "application/json"
                ]
            ])
            .map { $0.map(Self.parseResultBuffer(_:)) }
    }

    private static func parseResultBuffer(_ buffer: JSArrayBuffer) -> Response {
        var uint32View: (UInt32, UInt32)? = nil
        if buffer.byteLength >= 8 {
            let bytes = buffer.slice(from: 0, to: 8)
            func toUInt32<S: Collection>(_ bytes: S) -> UInt32 where S.Element == UInt8, S.Index == Int {
                let byte0 = UInt32(bytes[0])
                let byte1 = UInt32(bytes[1] << 8)
                let byte2 = UInt32(bytes[2] << 16)
                let byte3 = UInt32(bytes[3] << 24)
                return byte0 + byte1 + byte2 + byte3
            }
            uint32View?.0 = toUInt32(bytes)
            uint32View?.1 = toUInt32(Array(bytes[4...]))
        }

        func fail() -> Response {
            .failure(output: String(decoding: buffer.slice(from: 0), as: UTF8.self))
        }

        guard let (firstUInt32View, secondUInt32View) = uint32View else {
            return fail()
        }
        if firstUInt32View != 0xdec0ded0 {
            return fail()
        }

        let jsonLength = Int(secondUInt32View)
        let jsonBuffer = buffer.slice(from: 8, to: 8 + jsonLength)
        let jsonString = String(decoding: jsonBuffer, as: UTF8.self)
        let jsonObject = JSON.parse(jsonString)
        let binary = buffer.slice(from: 8 + jsonLength)
        if jsonObject.success == .boolean(true) {
            return .success(binary: binary, output: jsonObject.output.string!)
        } else {
            return .failure(output: jsonObject.output.string!)
        }
    }
}

class Page {
    let codeArea: JSObjectRef
    let runButton: JSObjectRef
    let outputArea: JSObjectRef
    let downloadWasmButton: JSObjectRef
    let emailLink: JSObjectRef


    let compilerService = CompilerService()

    var state = State()
    struct State {
        var currentDownloadURL: String? = nil
    }

    init(document: JSObjectRef) {
        codeArea = document.getEmenentId!("code-area").object!
        runButton = document.getEmenentId!("code-run").object!
        outputArea = document.getEmenentId!("output-area").object!
        downloadWasmButton = document.getEmenentId!("code-download-wasm").object!
        emailLink = document.getElementById!("emaillink").object!

        codeArea.disable = .boolean(false)
        if codeArea.value.string! == "" {
            codeArea.value = .string(kDefaultDemoScript)
        }

        _ = codeArea.addEventListener!("keydown", JSFunctionRef.from(handleCodeAreaKeyPress(_:)))
        _ = runButton.addEventListener!("click", JSFunctionRef.from(runClicked(_:)))

        let atob = JSObjectRef.global.atob.function!
        emailLink.href = .string("mailto:" + atob("aGVsbG9Ac3dpZnR3YXNtLm9yZw==").string!)
    }

    func handleCodeAreaKeyPress(_ arguments: [JSValue]) -> JSValue {

        return .undefined
    }

    func runClicked(_ arguments: [JSValue]) -> JSValue {
        runButton.disabled = .boolean(true)
        downloadWasmButton.style.object!.display = .string("none")
        outputArea.textContent = .string("Compiling...")

        if let currentDownloadURL = state.currentDownloadURL {
            let revokeObjectURL = JSObjectRef.global.URL.object!.revokeObjectURL.function!
            revokeObjectURL(currentDownloadURL)
        }

        let code = codeArea.value.string!
        let compileResult = compilerService.compile(code)
        let instantiateResult = compileResult.flatMap { result -> Async<Result<String, Error>> in
            switch result {
            case let .success(.success(binary, output)):
                return WebAssembly.runWasm(binary)
                    .map { $0.map { (output) } }
            case let .success(.failure(output)):
                return Async.just(.failure(MessageError(message: output)))
            case let .failure(error):
                return Async.just(.failure(error))
            }
        }

        instantiateResult.subscribe { result in
            switch result {
            case let .success(output):
                print(output)
            case let .failure(error):
                print(error)
            }

            self.runButton.disabled = .boolean(false)
        }
        return .undefined
    }

    func populateResultsArea(_ response: CompilerService.Response) {
        outputArea.textContent = .string(response.output)
        if case let .success(binary, _) = response {
            let Blob = JSObjectRef.global.Blob.function!
            let blob = Blob.new([binary.jsValue()], [
                "type": "application/wasm",
            ])
            let createObjectURL = JSObjectRef.global.URL.object!.createObjectURL.function!
            let wasmDownloadURL = createObjectURL(blob).string!
            state.currentDownloadURL = wasmDownloadURL
            downloadWasmButton.href = .string(wasmDownloadURL)
        }
    }
}


class WebAssembly {
    private static let object = JSObjectRef.global.WebAssembly.object!
    private static let Uint8Array = JSObjectRef.global.Uint8Array.function!
    private static let WasmFs = JSObjectRef.global.WasmFs.function!
    private static let WASI = JSObjectRef.global.WASI.function!
    private static let WASIObject = JSObjectRef.global.WASI.object!
    private static let Object = JSObjectRef.global.Object.object!

    static func runWasm(_ binary: [UInt8]) -> Async<Result<Void, Error>> {
        let wasmBytes = Uint8Array.new(binary.jsValue())
        let wasmFs = WasmFs.new()
        let originalWriteFileSync = wasmFs.fs.object!.writeFileSync.function!
        wasmFs.fs.object!.writeFileSync = .function(JSFunctionRef.from({ arguments -> JSValue in
            let path = arguments[0].string!
            let text = arguments[1].string!
            print(text)
            originalWriteFileSync(path, text)
            return .undefined
        }))

        let bindings = Object.assign!(
            [String: JSValueConvertible](),
            WASIObject.defaultBindings.object!,
            ["fs": wasmFs.fs.object!]
        )
        let wasi = WASI.new([
            "args": [JSValueConvertible](),
            "env": [String: JSValueConvertible](),
            "bindings": bindings,
        ])
        let promise = object.instantiate!(wasmBytes, [
            "wasi_snapshot_preview1": wasi.wasiImport.object!
        ]).object!
        return Async.fromPromise(promise).map {
            $0.map {
                let results = $0.object!
                _ = wasi.start!(results.instance.object!)
            }
        }
    }
}

extension UInt8: JSValueConvertible {
    public func jsValue() -> JSValue {
        .number(Int32(self))
    }
}
