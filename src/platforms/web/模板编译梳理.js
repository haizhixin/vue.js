// crateCompileToFunctionFn返回一个compileToFunctions函数
export function createCompileToFunctionFn(compile: Function): Function {

    // 创建一个不含原型链的空对象用于储存缓存想信息
    const cache = Object.create(null)

    return function compileToFunctions(template, options, vm) {

        const compiled = compile(template, options)
        // compile对象 包含两个属性 errors tips 均为数组 包含了模版编译过程中的错误和提示信息
        // turn code into functions
        const res = {} // 定义一个空对象也是最终的返回值
        const fnGenErrors = [] //定义一个空数组
        // 在res对象上添加一个render函数
        // render就是最终的渲染函数 通过createFunction函数创建出来
        // render和staticRenderFns分别是一个字符串和字符串数组
        res.render = createFunction(compiled.render, fnGenErrors)
        // staticRenderFns是一个渲染函数优化
        res.staticRenderFns = compiled.staticRenderFns.map(code => {
            return createFunction(code, fnGenErrors)
        })
        // 返回编译结果的同时将其缓存 这样发现下一次cache中有相同的key不需要再次编译 就直接返回缓存结果
        return (cache[key] = res)
    }
}




// 此处应用函数柯里化 把多元函数转化为一元函数
export function createCompilerCreator(baseCompile) {

    return function createCompiler(baseOptions) {
        // 定义了compile函数 //接收两个参数
        // 一,template模版字符串。二,选项参数

        // compile函数的作用
        // 一,生成最终编译器选项finalOptions
        // 二,对错误的收集
        // 三,调用baseCompile编译模板
        function compile(template, options) {
            // 以baseOptions为原型创建finalOptions常量 finalOptions才是最终的编译选项参数
            const finalOptions = Object.create(baseOptions)
            // compile函数对模板的编译是委托baseCompile函数来完成的
            // baseCompile是函数createCompilerCreator的形参 是在/compiler/index.js中调用createCompilerCreator传递过来的
            // compiled是baseCompile函数对模板的编译结果
            const compiled = baseCompile(template.trim(), finalOptions)
            return compiled
        }
        //返回一个对象 包含 compile函数本身和compileToFunctions函数
        return {
            compile,
            compileToFunctions: createCompileToFunctionFn(compile)
        }
    }
}


// 调用createCompilerCreator函数 返回createCompiler函数
const createCompiler = createCompilerCreator(
    // 对模版进行编译工作的实际是baseCompile函数
    // 接收两个参数 字符串模版和选项参数
    function baseCompile(template, options) {
        // 调用parse函数把字符串模板解析成抽象语法树
        const ast = parse(template.trim(), options)
        if (options.optimize !== false) {
            // 调用optimize函数优化 AST
            optimize(ast, options)
        }
        // 将AST编译成字符串形式的渲染函数
        // 由baseCompile函数的返回结果来看 code是一个对象 包含 render和 staticRenderFns属性
        const code = generate(ast, options)
        // 最终返回一个对象
        return {
            ast, //抽象语法树
            render: code.render, // 字符串形式的渲染函数
            staticRenderFns: code.staticRenderFns // 字符串形式的静态渲染函数
        }
    }
)


const { compile, compileToFunctions } = createCompiler(baseOptions)
const { render, staticRenderFns } = compileToFunctions(template, {})
