/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

// createCompiler创建一个编译器
const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
