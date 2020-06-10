/* @flow */
import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
    def,
    warn,
    hasOwn,
    hasProto,
    isObject,
    isPlainObject,
    isPrimitive,
    isUndef,
    isValidArrayIndex,
    isServerRendering
} from '../util/index'

// 方法返回一个由指定对象的所有自身属性的属性名（包括不可枚举属性但不包括Symbol值作为名称的属性）组成的数组。
const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving(value: boolean) {
    shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts(转化) the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
// Observer类会附加到每一个被侦测的object上，
// 一旦附加上，Observer会将object的所有属性转换为getter/setter的形式
// 来收集属性的依赖,并且当属性发生变化时会通知这些依赖
export class Observer {
    value: any;
    dep: Dep;
    vmCount: number; // number of vms that have this object as root $data

    constructor(value: any) {
        this.value = value
        this.dep = new Dep()
        this.vmCount = 0
        // 在value上新增一个不可枚举的属性_ob_ 这个属性的值就是当前Observer的实例
        // 只有对象为数组才有_ob_属性
        def(value, '__ob__', this)
        // 区分对象和数组 做不同的响应化处理

        if (Array.isArray(value)) {
            if (hasProto) { // 如果浏览器 支持_proto_ 用arrayMethods去覆盖 array原型上的方法
                protoAugment(value, arrayMethods)
            } else { // 如果浏览器不支持_proto_ 直接把arrayMethods上的方法覆盖到 Value上 value是个对象
                copyAugment(value, arrayMethods, arrayKeys)
            }

            // 总之无论是 protoAugment 函数还是 copyAugment 函数，
            // 他们的目的只有一个：把数组实例与代理原型或与代理原型中定义的函数联系起来，从而拦截数组变异方法。
            // 为了使嵌套的数组或对象同样是响应式数据，我们需要递归的观测那些类型为数组或对象的数组元素，而这就是 observeArray 方法的作用
            this.observeArray(value)
        } else { // 如果是对象 walk行走
            this.walk(value)
        }
    }

    /**
     * Walk through all properties and convert them into
     * getter/setters. This method should only be called when
     * value type is Object.
     */
    walk(obj: Object) {
        const keys = Object.keys(obj)
        for (let i = 0; i < keys.length; i++) {
            defineReactive(obj, keys[i])
        }
    }

    /**
     * Observe a list of Array items.
     */
    observeArray(items: Array < any > ) {
        for (let i = 0, l = items.length; i < l; i++) {
            observe(items[i])
        }
    }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target, src: Object) {
    /* eslint-disable no-proto */
    target.__proto__ = src
    /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array < string > ) {
    for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i]
        def(target, key, src[key])
    }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
// 第一个参数需要监测的数据  第二个参数代表被观测的数据是否是根级数据
export function observe(value: any, asRootData: ? boolean): Observer | void {
    // 如果不是对象 直接返回 不包括null
    if (!isObject(value) || value instanceof VNode) {
        return
    }
    let ob: Observer | void
    // 如果已经转化为了响应式数据 直接返回Observer实例
    if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
        ob = value.__ob__
    } else if (
        shouldObserve && //一个开关是否需要被观测
        !isServerRendering() && // 非服务端渲染才进行观测
        (Array.isArray(value) || isPlainObject(value)) && // 数组或纯对象才进行观测
        Object.isExtensible(value) && // 必须为可扩展的对象 非可扩展对象包含Object.preventExtensions()、Object.freeze() 以及 Object.seal()
        !value._isVue //我们知道 Vue 实例对象拥有 _isVue 属性，所以这个条件用来避免 Vue 实例对象被观测。
    ) {
        // 返回观察者实例
        ob = new Observer(value)
    }
    if (asRootData && ob) {
        ob.vmCount++
    }
    return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive(
    obj: Object,
    key: string,
    val: any,
    customSetter ? : ? Function,
    shallow ? : boolean
) {
    const dep = new Dep()

    const property = Object.getOwnPropertyDescriptor(obj, key)
    if (property && property.configurable === false) {
        return
    }

    // cater for pre-defined getter/setters
    const getter = property && property.get
    const setter = property && property.set


    if ((!getter || setter) && arguments.length === 2) {
        val = obj[key]
    }
    // 第一：由于当属性存在原本的 getter 时在深度观测之前不会取值，所以在深度观测语句执行之前取不到属性值从而无法深度观测。
    // 第二：之所以在深度观测之前不取值是因为属性原本的 getter 由用户定义，用户可能在 getter 中做任何意想不到的事情，
    // 这么做是出于避免引发不可预见行为的考虑。


    // childOb返回观察者实例

    let childOb = !shallow && observe(val)
    Object.defineProperty(obj, key, {
        enumerable: true,
        configurable: true,
        get: function reactiveGetter() {
            const value = getter ? getter.call(obj) : val
            if (Dep.target) {
                // dep对象就是属性的getter/setter通过闭包引用的收集依赖的"框"
                dep.depend()
                if (childOb) {
                    // 所以childOb ===  data上的__ob__
                    // 所以childOb.dep === data.__ob__.dep。也就是说 childOb.dep.depend()
                    childOb.dep.depend()
                    if (Array.isArray(value)) {
                        dependArray(value)
                    }
                }
            }
            return value
        },
        set: function reactiveSetter(newVal) {
            const value = getter ? getter.call(obj) : val
            /* eslint-disable no-self-compare */
            // NaN===NaN为false
            if (newVal === value || (newVal !== newVal && value !== value)) {
                return
            }
            /* eslint-enable no-self-compare */
            if (process.env.NODE_ENV !== 'production' && customSetter) {
                customSetter()
            }
            // #7981: for accessor properties without setter
            if (getter && !setter) return
            if (setter) {
                setter.call(obj, newVal)
            } else {
                val = newVal
            }
            // 对新赋值进行深度观测
            childOb = !shallow && observe(newVal)
            dep.notify()
        }
    })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: Array < any > | Object, key: any, val: any): any {
    if (process.env.NODE_ENV !== 'production' &&
        (isUndef(target) || isPrimitive(target))
    ) {
        warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
    }
    if (Array.isArray(target) && isValidArrayIndex(key)) {
        target.length = Math.max(target.length, key)
        target.splice(key, 1, val)
        return val
    }
    if (key in target && !(key in Object.prototype)) {
        target[key] = val
        return val
    }
    const ob = (target: any).__ob__
    if (target._isVue || (ob && ob.vmCount)) {
        process.env.NODE_ENV !== 'production' && warn(
            'Avoid adding reactive properties to a Vue instance or its root $data ' +
            'at runtime - declare it upfront in the data option.'
        )
        return val
    }
    if (!ob) {
        target[key] = val
        return val
    }
    defineReactive(ob.value, key, val)
    ob.dep.notify()
    return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array < any > | Object, key: any) {
    if (process.env.NODE_ENV !== 'production' &&
        (isUndef(target) || isPrimitive(target))
    ) {
        warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
    }
    if (Array.isArray(target) && isValidArrayIndex(key)) {
        target.splice(key, 1)
        return
    }
    const ob = (target: any).__ob__
    if (target._isVue || (ob && ob.vmCount)) {
        process.env.NODE_ENV !== 'production' && warn(
            'Avoid deleting properties on a Vue instance or its root $data ' +
            '- just set it to null.'
        )
        return
    }
    if (!hasOwn(target, key)) {
        return
    }
    delete target[key]
    if (!ob) {
        return
    }
    ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray(value: Array < any > ) {
    for (let e, i = 0, l = value.length; i < l; i++) {
        e = value[i]
        e && e.__ob__ && e.__ob__.dep.depend()
        if (Array.isArray(e)) {
            dependArray(e)
        }
    }
}
