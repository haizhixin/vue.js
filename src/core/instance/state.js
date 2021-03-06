/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
    set,
    del,
    observe,
    defineReactive,
    toggleObserving
} from '../observer/index'

import {
    warn,
    bind,
    noop,
    hasOwn,
    hyphenate,
    isReserved,
    handleError,
    nativeWatch,
    validateProp,
    isPlainObject,
    isServerRendering,
    isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
    enumerable: true,
    configurable: true,
    get: noop,
    set: noop
}

export function proxy(target: Object, sourceKey: string, key: string) {
    sharedPropertyDefinition.get = function proxyGetter() {
        return this[sourceKey][key]
    }
    sharedPropertyDefinition.set = function proxySetter(val) {
        this[sourceKey][key] = val
    }

    // proxy 函数的原理是通过 Object.defineProperty 函数在实例对象 vm 上定义与 data 数据字段同名的访问器属性，
    // 并且这些属性代理的值是 vm._data 上对应属性的值。比如：
    // const ins = new Vue ({
    //   data: {
    //     a: 1
    //   }
    // })
    // 当我们访问 ins.a 时实际访问的是 ins._data.a。而 ins._data 才是真正的数据对象。

    Object.defineProperty(target, key, sharedPropertyDefinition)
}

export function initState(vm: Component) {
    vm._watchers = []
    const opts = vm.$options
    if (opts.props) initProps(vm, opts.props)
    if (opts.methods) initMethods(vm, opts.methods)
    if (opts.data) {
        initData(vm)
    } else {
        observe(vm._data = {}, true /* asRootData */ )
    }
    if (opts.computed) initComputed(vm, opts.computed)
    if (opts.watch && opts.watch !== nativeWatch) {
        initWatch(vm, opts.watch)
    }
}

function initProps(vm: Component, propsOptions: Object) {
    const propsData = vm.$options.propsData || {}
    const props = vm._props = {}
    // cache prop keys so that future props updates can iterate using Array
    // instead of dynamic object key enumeration.
    const keys = vm.$options._propKeys = []
    const isRoot = !vm.$parent
    // root instance props should be converted
    if (!isRoot) {
        toggleObserving(false)
    }
    for (const key in propsOptions) {
        keys.push(key)

        // {
        //   name: 'someComp',
        //   props: {
        //     prop1: String
        //   }
        // }
        // 并像如下代码这样使用：

        // <some-comp prop1="str" />
        // 那么 validateProp 函数接收的四个参数将会是：

        // key = 'prop1'
        // // props 选项参数
        // propOptions = {
        //   prop1: {
        //     type: String
        //   }
        // }
        // // props 数据
        // propsData = {
        //   prop1: 'str'
        // }
        // // 组件实例对象
        // vm = vm
        const value = validateProp(key, propsOptions, propsData, vm)
        /* istanbul ignore else */
        if (process.env.NODE_ENV !== 'production') {
            const hyphenatedKey = hyphenate(key)
            if (isReservedAttribute(hyphenatedKey) ||
                config.isReservedAttr(hyphenatedKey)) {
                warn(
                    `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
                    vm
                )
            }
            defineReactive(props, key, value, () => {
                if (!isRoot && !isUpdatingChildComponent) {
                    warn(
                        `Avoid mutating a prop directly since the value will be ` +
                        `overwritten whenever the parent component re-renders. ` +
                        `Instead, use a data or computed property based on the prop's ` +
                        `value. Prop being mutated: "${key}"`,
                        vm
                    )
                }
            })
        } else {
            defineReactive(props, key, value)
        }
        // static props are already proxied on the component's prototype
        // during Vue.extend(). We only need to proxy props defined at
        // instantiation here.
        if (!(key in vm)) {
            proxy(vm, `_props`, key)
        }
    }
    toggleObserving(true)
}

function initData(vm: Component) {
    // 1,根据 vm.$options.data 选项获取真正想要的数据（注意：此时 vm.$options.data 是函数）
    // 2,校验得到的数据是否是一个纯对象
    // 3,检查数据对象 data 上的键是否与 props 对象上的键冲突
    // 4,检查 methods 对象上的键是否与 data 对象上的键冲突
    // 5,在 Vue 实例对象上添加代理访问数据对象的同名属性
    // 6,最后调用 observe 函数开启响应式之路
    let data = vm.$options.data
    data = vm._data = typeof data === 'function' ?
        getData(data, vm) :
        data || {}
    if (!isPlainObject(data)) {
        data = {}
        process.env.NODE_ENV !== 'production' && warn(
            'data functions should return an object:\n' +
            'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
            vm
        )
    }
    // proxy data on instance
    const keys = Object.keys(data)
    const props = vm.$options.props
    const methods = vm.$options.methods
    let i = keys.length
    while (i--) {
        const key = keys[i]
        if (process.env.NODE_ENV !== 'production') {
            if (methods && hasOwn(methods, key)) {
                warn(
                    `Method "${key}" has already been defined as a data property.`,
                    vm
                )
            }
        }
        if (props && hasOwn(props, key)) {
            process.env.NODE_ENV !== 'production' && warn(
                `The data property "${key}" is already declared as a prop. ` +
                `Use prop default value instead.`,
                vm
            )

            // props优先级大于methods优先级大于data优先级  如果key在props中定义了就不能在data和 methods中进行定义
            // 如果在data中定义了就不能在methods中再定义了
            // 判断key是否是以$ 或_开头 因为vue自身的属性都是以 $ _开头 如果不是返回false执行如下方法
        } else if (!isReserved(key)) {
            proxy(vm, `_data`, key)
        }
    }
    // observe data
    // 数据响应化的开始
    observe(data, true /* asRootData */ )
}

// getData通过调用data选项从而获取数据对象
export function getData(data: Function, vm: Component): any {
    // #7573 disable dep collection when invoking data getters
    pushTarget()
    try {
        return data.call(vm, vm)
    } catch (e) {
        handleError(e, vm, `data()`)
        return {}
    } finally {
        popTarget()
    }
}

const computedWatcherOptions = { lazy: true }
// 之前的版本
// const computedWatcherOptions = { computed: true }

function initComputed(vm: Component, computed: Object) {
    // $flow-disable-line
    const watchers = vm._computedWatchers = Object.create(null)
    // computed properties are just getters during SSR
    // 判断当前运行环境是否是服务端渲染
    const isSSR = isServerRendering()

    for (const key in computed) {
        // 用来保存用户设置的计算属性定义
        const userDef = computed[key]

        // computed: {
        //   someComputedProp () {
        //     return this.a + this.b
        //   }
        // }
        // // 等价于
        // computed: {
        //   someComputedProp: {
        //     get () {
        //       return this.a + this.b
        //     }
        //   }
        // }

        // 如果用户传入的计算属性既不是函数 也不对象或者说是对象但没有提供get方法 报错警告
        const getter = typeof userDef === 'function' ? userDef : userDef.get
        if (process.env.NODE_ENV !== 'production' && getter == null) {
            warn(
                `Getter is missing for computed property "${key}".`,
                vm
            )
        }

        if (!isSSR) {
            // create internal watcher for the computed property.
            // 创建了一个观察者实例对象，我们称之为 计算属性的观察者
            watchers[key] = new Watcher(
                vm,
                getter || noop,
                noop,
                computedWatcherOptions
            )
        }

        // component-defined computed properties are already defined on the
        // component prototype. We only need to define computed properties defined
        // at instantiation here.
        // 这段代码首先检查计算属性的名字是否已经存在于组件实例对象中，我们知道在初始化计算属性之前已经初始化了 props、methods 和 data 选项，并且这些选项数据都会定义在组件实例对象上，由于计算属性也需要定义在组件实例对象上，所以需要使用计算属性的名字检查组件实例对象上是否已经有了同名的定义，如果该名字已经定义在组件实例对象上，那么有可能是 data 数据或 props 数据或 methods 数据之一，对于 data 和 props 来讲他们是不允许被 computed 选项中的同名属性覆盖的，所以在非生产环境中还要检查计算属性中是否存在与 data 和 props 选项同名的属性，如果有则会打印警告信息。如果没有则调用 defineComputed 定义计算属性。
        if (!(key in vm)) {
            defineComputed(vm, key, userDef)
        } else if (process.env.NODE_ENV !== 'production') {
            if (key in vm.$data) {
                warn(`The computed property "${key}" is already defined in data.`, vm)
            } else if (vm.$options.props && key in vm.$options.props) {
                warn(`The computed property "${key}" is already defined as a prop.`, vm)
            }
        }
    }

    export function defineComputed(
        target: any,
        key: string,
        userDef: Object | Function
    ) {
        // 判断computed是否有缓存 isServerRendering是否是服务端渲染
        // 只有非服务端渲染环境下才为true 也就是说只有非服务端渲染环境下计算属性才有缓存
        const shouldCache = !isServerRendering()
        if (typeof userDef === 'function') {
            sharedPropertyDefinition.get = shouldCache ?
                createComputedGetter(key) :
                createGetterInvoker(userDef)
            sharedPropertyDefinition.set = noop
        } else {
            sharedPropertyDefinition.get = userDef.get ?
                shouldCache && userDef.cache !== false ?
                createComputedGetter(key) :
                createGetterInvoker(userDef.get) :
                noop
            sharedPropertyDefinition.set = userDef.set || noop
        }

        // 总之，无论 userDef 是函数还是对象，在非服务端渲染的情况下，配置对象 sharedPropertyDefinition 最终将变成如下这样：

        // sharedPropertyDefinition = {
        //   enumerable: true,
        //   configurable: true,
        //   get: createComputedGetter(key),
        //   set: userDef.set // 或 noop
        // }

        // 也就是说计算属性真正的 get 拦截器函数就是 computedGetter 函数，如下：

        // sharedPropertyDefinition = {
        //   enumerable: true,
        //   configurable: true,
        //   get: function computedGetter () {
        //     const watcher = this._computedWatchers && this._computedWatchers[key]
        //     if (watcher) {
        //       watcher.depend()
        //       return watcher.evaluate()
        //     }
        //   },
        //   set: noop // 没有指定 userDef.set 所以是空函数
        // }


        if (process.env.NODE_ENV !== 'production' &&
            sharedPropertyDefinition.set === noop) {
            sharedPropertyDefinition.set = function() {
                warn(
                    `Computed property "${key}" was assigned to but it has no setter.`,
                    this
                )
            }
        }
        Object.defineProperty(target, key, sharedPropertyDefinition)
    }

    function createComputedGetter(key) {
        return function computedGetter() {
            // 每一个计算属性的watcher
            const watcher = this._computedWatchers && this._computedWatchers[key]
            if (watcher) {
                // watcher.dirty标识计算属性的返回值是否有变化
                // 当 dirty 为 true 时，读取 computed 会重新计算
                // 当 dirty 为 false 时，读取 computed 会使用缓存
                if (watcher.dirty) {
                    // 对计算属性求值 从而触发依赖的响应式属性的get  从而把计算属性的watcher收集到 响应式属性的依赖列表中
                    watcher.evaluate()
                }
                if (Dep.target) {
                    watcher.depend()
                }
                return watcher.value
            }
        }
    }

    function createGetterInvoker(fn) {
        return function computedGetter() {
            return fn.call(this, this)
        }
    }

    function initMethods(vm: Component, methods: Object) {
        const props = vm.$options.props
        for (const key in methods) {
            if (process.env.NODE_ENV !== 'production') {
                if (typeof methods[key] !== 'function') {
                    warn(
                        `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
                        `Did you reference the function correctly?`,
                        vm
                    )
                }
                if (props && hasOwn(props, key)) {
                    warn(
                        `Method "${key}" has already been defined as a prop.`,
                        vm
                    )
                }
                if ((key in vm) && isReserved(key)) {
                    warn(
                        `Method "${key}" conflicts with an existing Vue instance method. ` +
                        `Avoid defining component methods that start with _ or $.`
                    )
                }
            }
            vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
        }
    }

    // 用了 watch 选项
    function initWatch(vm: Component, watch: Object) {
        for (const key in watch) {
            const handler = watch[key]

            // watch: {
            //   name: [
            //     function () {
            //       console.log('name 改变了1')
            //     },
            //     function () {
            //       console.log('name 改变了2')
            //     }
            //   ]
            // }
            if (Array.isArray(handler)) {
                for (let i = 0; i < handler.length; i++) {
                    createWatcher(vm, key, handler[i])
                }
            } else {
                createWatcher(vm, key, handler)
            }
        }

        function createWatcher(
            vm: Component,
            expOrFn: string | Function,
            handler: any,
            options ? : Object
        ) {

            // watch: {
            //   c: {
            //     handler: function (val, oldVal) { /* ... */ },
            //     deep: true
            //   }
            // }

            if (isPlainObject(handler)) {
                options = handler
                handler = handler.handler
            }
            // watch: {
            //   name: 'handleNameChange'
            // },
            // methods: {
            //   handleNameChange () {
            //     console.log('name change')
            //   }
            // }
            if (typeof handler === 'string') {
                handler = vm[handler]
            }
            return vm.$watch(expOrFn, handler, options)
        }

        export function stateMixin(Vue: Class < Component > ) {
            // flow somehow has problems with directly declared definition object
            // when using Object.defineProperty, so we have to procedurally build up
            // the object here.
            const dataDef = {}
            dataDef.get = function() { return this._data }
            const propsDef = {}
            propsDef.get = function() { return this._props }
            // 设置$data和$props为只读属性
            if (process.env.NODE_ENV !== 'production') {
                dataDef.set = function() {
                    warn(
                        'Avoid replacing instance root $data. ' +
                        'Use nested data properties instead.',
                        this
                    )
                }
                propsDef.set = function() {
                    warn(`$props is readonly.`, this)
                }
            }
            Object.defineProperty(Vue.prototype, '$data', dataDef)
            Object.defineProperty(Vue.prototype, '$props', propsDef)

            Vue.prototype.$set = set
            Vue.prototype.$delete = del

            Vue.prototype.$watch = function(
                expOrFn: string | Function,
                cb: any,
                options ? : Object
            ): Function {
                const vm: Component = this
                // $watch第二个参数可以是一个函数或者对象
                if (isPlainObject(cb)) { // 如果是对象
                    return createWatcher(vm, expOrFn, cb, options)
                }
                options = options || {}
                options.user = true
                const watcher = new Watcher(vm, expOrFn, cb, options)
                // 我们知道 immediate 选项用来在属性或函数被侦听后立即执行回调，如上代码就是其实现原理，
                // 如果发现 options.immediate 选项为真，那么会执行回调函数，不过此时回调函数的参数只有新值没有旧值。同时取值的方式是通过前面创建的观察者实例对象的 watcher.value 属性。我们知道观察者实例对象的 value 属性，保存着被观察属性的值。
                if (options.immediate) {
                    try {
                        cb.call(vm, watcher.value)
                    } catch (error) {
                        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
                    }
                }

                return function unwatchFn() {
                    // 解除观察者与属性之间的关系
                    watcher.teardown()
                }
            }
