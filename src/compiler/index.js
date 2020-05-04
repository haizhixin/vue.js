/* @flow */

import { parse} from './parser/index'
import { optimize} from './optimizer'
import { generate} from './codegen/index'
import { createCompilerCreator} from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// createCompiler创建一个编译器  createCompilerCreator创建一个编译器的创建者

// 调用createCompilerCreator函数 返回createCompiler函数
export const createCompiler = createCompilerCreator(
  // 对模版进行编译工作的实际是baseCompile函数
  // 接收两个参数 字符串模版和选项参数
  function baseCompile(template: string,options: CompilerOptions): CompiledResult {
    
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
      ast,//抽象语法树
      render: code.render,// 字符串形式的渲染函数
      staticRenderFns: code.staticRenderFns// 字符串形式的静态渲染函数
    }
  }
)
