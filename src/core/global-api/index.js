/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

// 主要作用为Vue添加全局API 也就是静态属性和静态方法
export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      // 不要替换Vue.config对象，而是设置各个字段。
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  {/* 创建一个options对象 该对象没有原型链 */}
  Vue.options = Object.create(null)
  {/* 为options属性注入 components组件 filters过滤器 directives指令 对象   */}
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  {/* // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios. */}
  Vue.options._base = Vue

 {/* 把vue属性上的组件和内建的keepAlive组件合并在一起 */}
 {/* extend(to,from)将from对象混合到to上 */}
  extend(Vue.options.components, builtInComponents)



  {/* 
  经以上处理完后的Vue
  Vue.options = {
	components: {
		KeepAlive
	},
	directives: Object.create(null),
	filters: Object.create(null),
	_base: Vue
} */}

  initUse(Vue)
  initMixin(Vue)
  initExtend(Vue)
 
  initAssetRegisters(Vue)
}
