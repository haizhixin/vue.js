/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0
// 传入一个vue组件类 
export function initMixin (Vue: Class<Component>) {
  // Vue原型上有个_init方法
  Vue.prototype._init = function (options?: Object) {
    // this指当前实例
    const vm: Component = this
    // a uid vue组件的唯一标识 每实例化一个Vue组件就会递增1
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    // 设置一个标志避免Vue实例被响应系统观测到
    vm._isVue = true
    // merge options
    if (options && options._isComponent) {
      // 优化内部组件
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      // 挂载实例属性$options
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),// vm.constructor就是Vue构造函数
        options || {},// 实例化时传过来的参数
        vm//当前实例
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm

    // 先初始化事件和属性 然后触发生命周期钩子
    initLifecycle(vm)
    initEvents(vm)
    initRender(vm)
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    // 核心是initState 重点研究initState
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 如果用户传递了el属性 自动开启模板编译阶段与挂载阶段
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// resolveConstructorOptions 解析constructor上的options
//Vue.prototype默认有一个公有且不可枚举的属性 这个属性的引用是对象关联的函数即 Vue
// Vue.prototype.constructor = Vue
export function resolveConstructorOptions (Ctor: Class<Component>) {
  // Ctor.options就是global-api/index.js下 Vue上添加的options属性
  let options = Ctor.options 
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    // 当Ctor是Vue.extend创建出来的子类时 Ctor在创建时保留了父类的选项 Sub.superOptions = Super.options(参见Vue.extend方法)
    // 创建子类时缓存的父类上的选项
    const cachedSuperOptions = Ctor.superOptions
      // 父类上的选项有变化
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      // 更新子类缓存的 父类上的选项
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached(后期修改附加) options (#4976)                  
      // 返回更新后的属性
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        // 合并修改附加后的选项到 子类的选项上
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        // 把子组件的 添加到父组件中
         new Vue({
           // components :{
           // "子组件名"
           //  }
         })
        
        }
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

// 比较两个对象的属性 返回update的属性
function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options // 最新的子类选项
  const sealed = Ctor.sealedOptions // 子类通过extend创建时缓存的 子类选项Sub.sealedOptions = extend({}, Sub.options)
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}






