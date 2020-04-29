/* @flow */

import { noop, extend } from 'shared/util'
import { warn as baseWarn, tip } from 'core/util/debug'
import { generateCodeFrame } from './codeframe'

type CompiledFunctionResult = {
  render: Function;// 真正渲染函数
  staticRenderFns: Array<Function>;// 真正的优化渲染函数
};

// 第一个参数为函数体字符串 第二个参数是一个数组
// code字符串将通过new Function()创建为函数
// errors的作用是当采用new Function()创建函数发生错误时 用来收集错误
function createFunction (code, errors) {
  try {
    return new Function(code)
  } catch (err) {

    errors.push({ err, code })
    return noop
  }
}

// crateCompileToFunctionFn返回一个compileToFunctions函数
export function createCompileToFunctionFn (compile: Function): Function {
 
  // 创建一个不含原型链的空对象用于储存缓存想信息
  const cache = Object.create(null)

  return function compileToFunctions (
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {


    // 将options合并到新对象并重新赋值给 options
    options = extend({}, options)
    // 定义warn常量
    const warn = options.warn || baseWarn
    // 最后将options.warn移除
    delete options.warn

    /* istanbul ignore if */
    // 将模板字符串编译成渲染函数依赖new Function
    // 检测new Function()函数是否可用,在某些情况下会给一个有用的提示
    if (process.env.NODE_ENV !== 'production') {
      // detect possible CSP restriction
      try {
        // 对new Function()进行错误捕获
        new Function('return 1')
      } catch (e) {
        // CSP内容安全策略
        if (e.toString().match(/unsafe-eval|CSP/)) {
          // 如果错误信息包含 unsafe-eval或者CSP给警告提示
          warn(
            'It seems you are using the standalone build of Vue.js in an ' +
            'environment with Content Security Policy that prohibits unsafe-eval. ' +
            'The template compiler cannot work in this environment. Consider ' +
            'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
            'templates into render functions.'
          )
        }
      }
      //解决方案
      // 1,预编译
      // 2,放宽你的CSP策略
    }

    // check cache
    // delimiters是一个数组,如果options.delimiters存在
    // 将其转化为字符串然后和template拼接在一块 然后作为key值
    const key = options.delimiters
      ? String(options.delimiters) + template
      : template
    if (cache[key]) {
      // 缓存字符串模板的编译结果  防止重复编译造成性能上的浪费
      return cache[key]
    }

    // compile
    // compile通过闭包引用来自createCompileToFunctionFn
    // 真正的编译工作最终依托于compile
    // compile函数执行后最终会返回一个compiled对象
    const compiled = compile(template, options)
    // compile对象 包含两个属性 errors tips 均为数组 包含了模版编译过程中的错误和提示信息

    // check compilation errors/tips
    // 检测模版编译成渲染函数字符串阶段时的错误
    if (process.env.NODE_ENV !== 'production') {
      // 如果有错误信息
      if (compiled.errors && compiled.errors.length) {
        if (options.outputSourceRange) {
          compiled.errors.forEach(e => {
            warn(
              `Error compiling template:\n\n${e.msg}\n\n` +
              generateCodeFrame(template, e.start, e.end),
              vm
            )
          })
        } else {
          warn(
            `Error compiling template:\n\n${template}\n\n` +
            compiled.errors.map(e => `- ${e}`).join('\n') + '\n',
            vm
          )
        }
      }
      // 如果有提示信息
      if (compiled.tips && compiled.tips.length) {
        if (options.outputSourceRange) {
          compiled.tips.forEach(e => tip(e.msg, vm))
        } else {
          compiled.tips.forEach(msg => tip(msg, vm))
        }
      }
    }

    // turn code into functions
    const res = {}// 定义一个空对象也是最终的返回值
    const fnGenErrors = []//定义一个空数组 
    // 在res对象上添加一个render函数
    // render就是最终的渲染函数 通过createFunction函数创建出来
    // render和staticRenderFns分别是一个字符串和字符串数组
    res.render = createFunction(compiled.render, fnGenErrors)
    // staticRenderFns是一个渲染函数优化
    res.staticRenderFns = compiled.staticRenderFns.map(code => {
      return createFunction(code, fnGenErrors)
    })

    // check function generation errors.
    // this should only happen if there is a bug in the compiler itself.
    // mostly for codegen development use
    /* istanbul ignore if */
    // 用来打印在生成渲染函数过程中的错误
    if (process.env.NODE_ENV !== 'production') {
      // 当不存在模版编译中的错误 且是生成渲染函数时产生的错误
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        warn(
          `Failed to generate render function:\n\n` +
          fnGenErrors.map(({ err, code }) => `${err.toString()} in\n\n${code}\n`).join('\n'),
          vm
        )
      }
    }
    
    // 返回编译结果的同时将其缓存 这样发现下一次cache中有相同的key不需要再次编译 就直接返回缓存结果
    return (cache[key] = res)
  }
}
