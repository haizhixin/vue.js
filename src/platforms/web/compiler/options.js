/* @flow */

import {isPreTag,mustUseProp,isReservedTag, getTagNamespace} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules,
  directives,
  isPreTag,//检查是否是pre标签
  isUnaryTag,// 检查是否是一元标签(自闭合标签)
  mustUseProp,// 检测一个属性在标签中是否需要使用props进行绑定
  canBeLeftOpenTag,//检测一个标签虽然不属于自闭合标签 但是可以自己补全并闭合
  isReservedTag,//检查给定的标签是否是保留标签
  getTagNamespace,//获取元素标签的命名空间
  staticKeys: genStaticKeys(modules)//根据编译器选项的modules生成静态键字符串
}
