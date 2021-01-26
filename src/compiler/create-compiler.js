/* @flow */
import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

// 此处应用函数柯里化 把多元函数转化为一元函数
export function createCompilerCreator(baseCompile: Function): Function {
    return function createCompiler(baseOptions: CompilerOptions) {
        // 定义了compile函数 //接收两个参数
        // 一,template模版字符串。二,选项参数

        // compile函数的作用
        // 一,生成最终编译器选项finalOptions
        // 二,对错误的收集
        // 三,调用baseCompile编译模板

        function compile(
            template: string,
            options ? : CompilerOptions
        ): CompiledResult {
            // 以baseOptions为原型创建finalOptions常量 finalOptions才是最终的编译选项参数
            const finalOptions = Object.create(baseOptions)
            const errors = []
            const tips = []

            // msg错误或提示的信息  tip用来标识是错误还是提示
            let warn = (msg, range, tip) => {
                // 如果是错误信息就添加到 errros里 如果是提示信息就添加在 tips里
                (tip ? tips : errors).push(msg)
            }

            // 使用编译器编译模板时传递的选项参数  baseOptions可以理解为编译器的默认选项或者基本选项
            if (options) {
                if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
                    // $flow-disable-line
                    const leadingSpaceLength = template.match(/^\s*/)[0].length

                    warn = (msg, range, tip) => {
                        const data: WarningMessage = {
                            msg
                        }
                        if (range) {
                            if (range.start != null) {
                                data.start = range.start + leadingSpaceLength
                            }
                            if (range.end != null) {
                                data.end = range.end + leadingSpaceLength
                            }
                        }
                        (tip ? tips : errors).push(data)
                    }
                }
                // merge custom modules
                // 如果存在 modules
                if (options.modules) {
                    // 合并baseOptions和options上的modules到finalOptions的modules
                    finalOptions.modules =
                        (baseOptions.modules || []).concat(options.modules)
                }
                // merge custom directives
                // 检查是否存在directives dircetives是一个对象而不是一个数组
                if (options.directives) {
                    finalOptions.directives = extend(
                        // 创建一个以baseOptions.directives对象为原型的新对象,然后使用extend方法将options的directives的属性混合到它上面
                        Object.create(baseOptions.directives || null),
                        options.directives
                    )
                }
                // copy other options
                // 如果不是modules和directives直接把options的其他属性复制到finalOptions
                for (const key in options) {
                    if (key !== 'modules' && key !== 'directives') {
                        finalOptions[key] = options[key]
                    }
                }
            }

            finalOptions.warn = warn

            // compile函数对模板的编译是委托baseCompile函数来完成的
            // baseCompile是函数createCompilerCreator的形参 是在/compiler/index.js中调用createCompilerCreator传递过来的
            // compiled是baseCompile函数对模板的编译结果
            const compiled = baseCompile(template.trim(), finalOptions)
            // 该结果中包含了模板编译后的抽象语法树AST
            if (process.env.NODE_ENV !== 'production') {
                // 通过抽象语法树来检查模板中是否存在错误表达式
                // 并把错误添加到对应的 errors或者tips中
                detectErrors(compiled.ast, warn)
            }
            // 将收集到的错误或者提示添加到compiled上并返回
            compiled.errors = errors
            compiled.tips = tips
            return compiled
        }
        //返回一个对象 包含 compile函数本身和compileToFunctions函数
        return {
            compile,
            compileToFunctions: createCompileToFunctionFn(compile)
        }
    }
}
