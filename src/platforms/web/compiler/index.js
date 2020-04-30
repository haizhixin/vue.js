/* @flow */

import {
  baseOptions
} from './options'
import {
  createCompiler
} from 'compiler/index'

// createCompiler创建一个编译器 返回一个对象包括 compile 和 compileToFunctions

//  compile函数 是字符串形式的代码 compileToFunctions是真正可执行的代码
const {
  compile,
  compileToFunctions
} = createCompiler(baseOptions)

export {
  compile,
  compileToFunctions
}
