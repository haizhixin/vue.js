/* @flow */

export const emptyObject = Object.freeze({})

// These helpers produce better VM code in JS engines due to their
// explicitness and function inlining.
export function isUndef(v: any): boolean % checks {
    return v === undefined || v === null
}

export function isDef(v: any): boolean % checks {
    return v !== undefined && v !== null
}

export function isTrue(v: any): boolean % checks {
    return v === true
}

export function isFalse(v: any): boolean % checks {
    return v === false
}

/**
 * Check if value is primitive.
 */
export function isPrimitive(value: any): boolean % checks {
    return (
        typeof value === 'string' ||
        typeof value === 'number' ||
        // $flow-disable-line
        typeof value === 'symbol' ||
        typeof value === 'boolean'
    )
}

/**
 * Quick object check - this is primarily used to tell
 * Objects from primitive values when we know the value
 * is a JSON-compliant type.
 */ // 区分对象和原始值
export function isObject(obj: mixed): boolean % checks {
    return obj !== null && typeof obj === 'object'
}

/**
 * Get the raw type string of a value, e.g., [object Object].
 */
// 借用原生的toString方法
const _toString = Object.prototype.toString

//获取一个数据真实的数据类型
// [object RegExp] 取得时 RegExp
export function toRawType(value: any): string {
    return _toString.call(value).slice(8, -1)
}

/**
 * Strict object type check. Only returns true
 * for plain JavaScript objects.
 */
// 判断是否是一个普通的javascript对象
// 借用Object.prototype上的toString方法 判断变量是否是一个纯对象
export function isPlainObject(obj: any): boolean {
    return _toString.call(obj) === '[object Object]'
}

export function isRegExp(v: any): boolean {
    return _toString.call(v) === '[object RegExp]'
}

/**
 * Check if val is a valid array index.
 */
export function isValidArrayIndex(val: any): boolean {
    const n = parseFloat(String(val))
    return n >= 0 && Math.floor(n) === n && isFinite(val)
}

export function isPromise(val: any): boolean {
    return (
        isDef(val) &&
        typeof val.then === 'function' &&
        typeof val.catch === 'function'
    )
}

/**
 * Convert a value to a string that is actually rendered.
 */
export function toString(val: any): string {
    return val == null ?
        '' :
        Array.isArray(val) || (isPlainObject(val) && val.toString === _toString) ?
        JSON.stringify(val, null, 2) :
        String(val)
}

/**
 * Convert an input value to a number for persistence.
 * If the conversion fails, return original string.
 */
export function toNumber(val: string): number | string {
    const n = parseFloat(val)
    return isNaN(n) ? val : n
}

/**
 * Make a map and return a function for checking if a key
 * is in that map.
 */
export function makeMap(
    str: string,
    expectsLowerCase ? : boolean
): (key: string) => true | void {
    const map = Object.create(null)
    const list: Array < string > = str.split(',')
    for (let i = 0; i < list.length; i++) {
        map[list[i]] = true
    }
    return expectsLowerCase ?
        val => map[val.toLowerCase()] :
        val => map[val]
}

/**
 * Check if a tag is a built-in tag.
 */
// 检测所注册的组件是否是内置的标签
export const isBuiltInTag = makeMap('slot,component', true)

/**
 * Check if an attribute is a reserved attribute.
 */
export const isReservedAttribute = makeMap('key,ref,slot,slot-scope,is')

/**
 * Remove an item from an array.
 */
// 删除数组中的指定的一个元素并返回删除的元素 void(和any相反,表示没有任何类型 当函数没有返回值 通常返回值类型为void)
export function remove(arr: Array < any > , item: any): Array < any > | void {
    if (arr.length) {
        const index = arr.indexOf(item)
        if (index > -1) {
            return arr.splice(index, 1)
        }
    }
}

/**
 * Check whether an object has the property.
 */
// 检查一个对象上是否包含某个属性不包括原型链上的属性
const hasOwnProperty = Object.prototype.hasOwnProperty
export function hasOwn(obj: Object | Array < * > , key: string): boolean {
    return hasOwnProperty.call(obj, key)
}

/**
 * Create a cached version of a pure function.
 */
// 创造一个纯函数的缓存版本
export function cached < F: Function > (fn: F): F {
    const cache = Object.create(null)
    return (function cachedFn(str: string) {
        const hit = cache[str]
        return hit || (cache[str] = fn(str))
    }: any)
}

/**
 * Camelize a hyphen-delimited string.
 */
// \w 查找单词字符

// https://juejin.im/post/5c6c18146fb9a049e232940c
// reolace 第一个参数是模式匹配正则  第二个参数是回调函数
// 回调函数的第一个参数是 匹配到的结果 回调函数对每一个匹配到的结果进行回调操作
// 回调函数接下来的参数是 匹配该模式中的某个圆括号子表达式的字符串 参数有一个或者多个
// 倒数第二个参数是匹配结果在字符串中的位置
// 最后一个参数 是原字符串
// 执行全局匹配（查找所有匹配而非在找到第一个匹配后停止）
const camelizeRE = /-(\w)/g //查找-后紧挨着的第一个字符
//连字符转驼峰
// aa-bb转化为 aaBB aa-转化为aa
export const camelize = cached((str: string): string => {
    return str.replace(camelizeRE, (_, c) => c ? c.toUpperCase() : '')
})

/**
 * Capitalize a string.
 */
export const capitalize = cached((str: string): string => {
    return str.charAt(0).toUpperCase() + str.slice(1)
})

/**
 * Hyphenate a camelCase string.
 */
// \B匹配非单词边界

// 这里的单词可以是中文字符,英文字符,数字；
// 符号可以是中文符号,英文符号,空格,制表符,换行
// hyphenate('aaaBbb')   // aaa-bbb
// 全局匹配字符串中的大写字母 且该大写字母前必须不是单词边界
const hyphenateRE = /\B([A-Z])/g
// $1代表捕获组捕获到的大写字母是个变量
export const hyphenate = cached((str: string): string => {
    return str.replace(hyphenateRE, '-$1').toLowerCase()
})

/**
 * Simple bind polyfill for environments that do not support it,
 * e.g., PhantomJS 1.x. Technically, we don't need this anymore
 * since native bind is now performant enough in most browsers.
 * But removing it would mean breaking code that was able to run in
 * PhantomJS 1.x, so this must be kept for backward compatibility.
 */

/* istanbul ignore next */
function polyfillBind(fn: Function, ctx: Object): Function {
    function boundFn(a) {
        const l = arguments.length
        return l ?
            l > 1 ?
            fn.apply(ctx, arguments) :
            fn.call(ctx, a) :
            fn.call(ctx)
    }

    boundFn._length = fn.length
    return boundFn
}

function nativeBind(fn: Function, ctx: Object): Function {
    return fn.bind(ctx)
}

export const bind = Function.prototype.bind ?
    nativeBind :
    polyfillBind

/**
 * Convert an Array-like object to a real Array.
 */
export function toArray(list: any, start ? : number): Array < any > {
    start = start || 0
    let i = list.length - start
    const ret: Array < any > = new Array(i)
    while (i--) {
        ret[i] = list[i + start]
    }
    return ret
}

/**
 * Mix properties into target object.
 */
// 把一个对象混合到一个新对象中去
export function extend(to: Object, _from: ? Object): Object {
    for (const key in _from) {
        to[key] = _from[key]
    }
    return to
}

/**
 * Merge an Array of Objects into a single Object.
 */
export function toObject(arr: Array < any > ): Object {
    const res = {}
    for (let i = 0; i < arr.length; i++) {
        if (arr[i]) {
            extend(res, arr[i])
        }
    }
    return res
}

/* eslint-disable no-unused-vars */

/**
 * Perform no operation.
 * Stubbing args to make Flow happy without leaving useless transpiled code
 * with ...rest (https://flow.org/blog/2017/05/07/Strict-Function-Call-Arity/).
 */
export function noop(a ? : any, b ? : any, c ? : any) {}

/**
 * Always return false.
 */
export const no = (a ? : any, b ? : any, c ? : any) => false

/* eslint-enable no-unused-vars */

/**
 * Return the same value.
 */
export const identity = (_: any) => _

/**
 * Generate a string containing static keys from compiler modules.
 */
// 根据compiler的modules生成含有静态key的字符串
export function genStaticKeys(modules: Array < ModuleOptions > ): string {
    return modules.reduce((keys, m) => {
        return keys.concat(m.staticKeys || [])
    }, []).join(',')
    // reduce()接收两个参数 第一个为回调函数 第二个为回调函数第一个参数的初始值
    // reduce 第一个参数是 回调函数上一次调用返回的值,或者是提供的初始值
    // reduce 第二个参数是 当前被处理的数组元素
    //  reduce 第三个参数 当前被处理的元素的索引
    //  reduce 第四个参数  调用reduce的数组
}

/**
 * Check if two values are loosely equal - that is,
 * if they are plain objects, do they have the same shape?
 */
export function looseEqual(a: any, b: any): boolean {
    if (a === b) return true
    const isObjectA = isObject(a)
    const isObjectB = isObject(b)
    if (isObjectA && isObjectB) {
        try {
            const isArrayA = Array.isArray(a)
            const isArrayB = Array.isArray(b)
            if (isArrayA && isArrayB) {
                return a.length === b.length && a.every((e, i) => {
                    return looseEqual(e, b[i])
                })
            } else if (a instanceof Date && b instanceof Date) {
                return a.getTime() === b.getTime()
            } else if (!isArrayA && !isArrayB) {
                const keysA = Object.keys(a)
                const keysB = Object.keys(b)
                return keysA.length === keysB.length && keysA.every(key => {
                    return looseEqual(a[key], b[key])
                })
            } else {
                /* istanbul ignore next */
                return false
            }
        } catch (e) {
            /* istanbul ignore next */
            return false
        }
    } else if (!isObjectA && !isObjectB) {
        return String(a) === String(b)
    } else {
        return false
    }
}

/**
 * Return the first index at which a loosely equal value can be
 * found in the array (if value is a plain object, the array must
 * contain an object of the same shape), or -1 if it is not present.
 */
export function looseIndexOf(arr: Array < mixed > , val: mixed): number {
    for (let i = 0; i < arr.length; i++) {
        if (looseEqual(arr[i], val)) return i
    }
    return -1
}

/**
 * Ensure a function is called only once.
 */
export function once(fn: Function): Function {
    let called = false
    return function() {
        if (!called) {
            called = true
            fn.apply(this, arguments)
        }
    }
}
