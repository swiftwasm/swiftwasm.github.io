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

@_silgen_name("executeScript")
func executeScript(script: UnsafePointer<CChar>, length: Int)

// Here's a string holding JavaScript code, with some string interpolation:
let scriptSrc = "alert('Hello from Swift! The 11th Fibonacci number is \\(fib(n: 11))');"
// and we can execute it.
executeScript(script: scriptSrc, length: strlen(scriptSrc))
"""

struct DataBuffer {
    private let buffer: JSObjectRef

    init(arrayBuffer: JSObjectRef) {
        self.buffer = arrayBuffer
    }

    func slice(from begin: Int, to end: Int? = nil) -> DataBuffer {
        if let end = end {
            return DataBuffer(arrayBuffer: buffer.slice!(begin, end).object!)
        } else {
            return DataBuffer(arrayBuffer: buffer.slice!(begin).object!)
        }
    }

    var byteLength: Int32 { buffer.byteLength.number! }

    static let Uint8Array = JSObjectRef.global.Uint8Array.function!

    var uint8: [UInt8] {
        let uint8Buffer = Self.Uint8Array.new(buffer)
        var _buffer = [UInt8]()
        let count = Int(uint8Buffer.length.number!)
        _buffer.reserveCapacity(count)
        for index in 0..<count {
            _buffer.append(UInt8(uint8Buffer[index].number!))
        }
        return _buffer
    }

    static let Uint32Array = JSObjectRef.global.Uint32Array.function!

    var uint32: [UInt32] {
        let uint32Buffer = Self.Uint32Array.new(buffer)
        var _buffer = [UInt32]()
        let count = Int(uint32Buffer.length.number!)
        _buffer.reserveCapacity(count)
        for index in 0..<count {
            _buffer.append(UInt32(bitPattern: uint32Buffer[index].number!))
        }
        return _buffer
    }
}

struct MessageError: Error {
    let message: String
    let line: UInt
    init(message: String, line: UInt = #line) {
        self.message = message
        self.line = line
    }
}

func fetch(_ url: String, _ options: [String: JSValueConvertible] = [:]) -> Async<Result<DataBuffer, Error>> {
    let jsFetch = JSObjectRef.global.fetch.function!
    let promise = jsFetch(url, options).object!
    return Async.fromPromise(promise).flatMap {
        switch $0 {
        case .success(let response):
            guard response.object!.body != .null else {
                return .just(.failure(MessageError(message: "Null Response")))
            }
            let bufferPromise = response.object!.arrayBuffer!().object!
            return Async.fromPromise(bufferPromise).map {
                $0.map { DataBuffer(arrayBuffer: $0.object!) }
            }
        case .failure(let error):
            return .just(.failure(error))
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
//        if code == kDefaultDemoScript {
//            return fetch(precompiledDemo).map { result in
//                result.map { arrayBuffer -> Response in
//                    .success(
//                        binary: arrayBuffer.uint8,
//                        output: ""
//                    )
//                }
//            }
//        }
        print(code)
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

    private static func parseResultBuffer(_ buffer: DataBuffer) -> Response {
        var uint32View: (UInt32, UInt32)? = nil
        let bytes = buffer.slice(from: 0, to: 8).uint32
        if buffer.byteLength >= 8 {
            uint32View = (bytes[0], bytes[1])
        }

        func fail() -> Response {
            .failure(output: String(decoding: buffer.uint8, as: UTF8.self))
        }

        guard let (firstUInt32View, secondUInt32View) = uint32View else {
            return fail()
        }
        if firstUInt32View != UInt32(0xdec0ded0) {
            return fail()
        }

        let jsonLength = Int(secondUInt32View)
        let jsonBuffer = buffer.uint8[8...]
        let jsonString = String(decoding: jsonBuffer, as: UTF8.self)
        let jsonObject = JSON.parse(jsonString)
        let binary = buffer.uint8[(8 + jsonLength)...]
        if jsonObject.success == .boolean(true) {
            return .success(binary: [UInt8](binary), output: jsonObject.output.string!)
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
        codeArea = document.getElementById!("code-area").object!
        runButton = document.getElementById!("code-run").object!
        outputArea = document.getElementById!("output-area").object!
        downloadWasmButton = document.getElementById!("code-download-wasm").object!
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
                return Async.just(.success(output))
            case let .failure(error):
                return Async.just(.failure(error))
            }
        }

        instantiateResult.subscribe { result in
            switch result {
            case let .success(output):
                self.outputArea.textContent = .string(output)
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
    private static let Uint8Array = JSObjectRef.global.Uint8Array.function!
    private static let swiftExport = JSObjectRef.global.swiftExports.object!
    private static let execWasm = swiftExport.execWasm.function!

    static func runWasm(_ binary: [UInt8]) -> Async<Result<Void, Error>> {
        let wasmBytes = Uint8Array.new(binary.jsValue())
        return Async.fromPromise(execWasm(wasmBytes).object!).map {
            $0.map { _ in }
        }
    }
}

extension UInt8: JSValueConvertible {
    public func jsValue() -> JSValue {
        .number(Int32(self))
    }
}

let page = Page(document: JSObjectRef.global.document.object!)
