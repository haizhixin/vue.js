/* @flow */

import { emptyObject } from 'shared/util'
import { parseFilters } from './parser/filter-parser'

type Range = { start ? : number, end ? : number };

/* eslint-disable no-unused-vars */
// baseWarn的作用是通过console.error来打印错误信息
export function baseWarn(msg: string, range ? : Range) {
    console.error(`[Vue compiler]: ${msg}`)
}
/* eslint-enable no-unused-vars */
// 从modules中取出 和 key相同的 属性值 并组成一个数组然后过滤掉数组中不存在的属性值
export function pluckModuleFunction < F: Function > (
    modules: ? Array < Object > ,
    key : string
): Array < F > {
    return modules ?
        modules.map(m => m[key]).filter(_ => _) : []
}

export function addProp(el: ASTElement, name: string, value: string, range ? : Range, dynamic ? : boolean) {
    (el.props || (el.props = [])).push(rangeSetItem({ name, value, dynamic }, range))
    el.plain = false
}

export function addAttr(el: ASTElement, name: string, value: any, range ? : Range, dynamic ? : boolean) {
    const attrs = dynamic ?
        (el.dynamicAttrs || (el.dynamicAttrs = [])) :
        (el.attrs || (el.attrs = []))
    attrs.push(rangeSetItem({ name, value, dynamic }, range))
    el.plain = false
}

// add a raw attr (use this in preTransforms)
export function addRawAttr(el: ASTElement, name: string, value: any, range ? : Range) {
    el.attrsMap[name] = value
    el.attrsList.push(rangeSetItem({ name, value }, range))
}

export function addDirective(
    el: ASTElement,
    name: string,
    rawName: string,
    value: string,
    arg: ? string,
    isDynamicArg : boolean,
    modifiers: ? ASTModifiers,
    range ? : Range
) {
    (el.directives || (el.directives = [])).push(rangeSetItem({
        name,
        rawName,
        value,
        arg,
        isDynamicArg,
        modifiers
    }, range))
    el.plain = false
}

function prependModifierMarker(symbol: string, name: string, dynamic ? : boolean): string {
    return dynamic ?
        `_p(${name},"${symbol}")` :
        symbol + name // mark the event as captured
}

export function addHandler(
    el: ASTElement,
    name: string,
    value: string,
    modifiers: ? ASTModifiers,
    important ? : boolean,
    warn ? : ? Function,
    range ? : Range,
    dynamic ? : boolean
) {
    modifiers = modifiers || emptyObject
    // warn prevent and passive modifier
    /* istanbul ignore if */
    if (
        process.env.NODE_ENV !== 'production' && warn &&
        modifiers.prevent && modifiers.passive
    ) {
        warn(
            'passive and prevent can\'t be used together. ' +
            'Passive handler can\'t prevent default event.',
            range
        )
    }

    // normalize click.right and click.middle since they don't actually fire
    // this is technically browser-specific, but at least for now browsers are
    // the only target envs that have right/middle clicks.
    if (modifiers.right) {
        if (dynamic) {
            name = `(${name})==='click'?'contextmenu':(${name})`
        } else if (name === 'click') {
            name = 'contextmenu'
            delete modifiers.right
        }
    } else if (modifiers.middle) {
        if (dynamic) {
            name = `(${name})==='click'?'mouseup':(${name})`
        } else if (name === 'click') {
            name = 'mouseup'
        }
    }

    // check capture modifier
    if (modifiers.capture) {
        delete modifiers.capture
        name = prependModifierMarker('!', name, dynamic)
    }
    if (modifiers.once) {
        delete modifiers.once
        name = prependModifierMarker('~', name, dynamic)
    }
    /* istanbul ignore if */
    if (modifiers.passive) {
        delete modifiers.passive
        name = prependModifierMarker('&', name, dynamic)
    }

    let events
    if (modifiers.native) {
        delete modifiers.native
        events = el.nativeEvents || (el.nativeEvents = {})
    } else {
        events = el.events || (el.events = {})
    }

    const newHandler: any = rangeSetItem({ value: value.trim(), dynamic }, range)
    if (modifiers !== emptyObject) {
        newHandler.modifiers = modifiers
    }

    const handlers = events[name]
    /* istanbul ignore if */
    if (Array.isArray(handlers)) {
        important ? handlers.unshift(newHandler) : handlers.push(newHandler)
    } else if (handlers) {
        events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
    } else {
        events[name] = newHandler
    }

    el.plain = false
}

export function getRawBindingAttr(
    el: ASTElement,
    name: string
) {
    return el.rawAttrsMap[':' + name] ||
        el.rawAttrsMap['v-bind:' + name] ||
        el.rawAttrsMap[name]
}

// 获取绑定属性的值 如果获取成功会将获取到的值用parseFilters函数进行处理 并将它处理好后的结果作为getBindingAttr函数的返回值
export function getBindingAttr(
    el: ASTElement,
    name: string,
    getStatic ? : boolean
): ? string {
    //根据传入的name 去获取:name或者v-bind:name的值
    // 绑定属性有这两种写法 把获取到的绑定属性的值赋值给dynamicValue
    const dynamicValue =
        getAndRemoveAttr(el, ':' + name) ||
        getAndRemoveAttr(el, 'v-bind:' + name)
    // if条件语句是判断绑定的属性是否存在 而不是绑定属性的属性值是否存在
    // 因为绑定属性值不存在 dynamicValue的值为"" ""!=null仍成立
    // 只有绑定属性不存在 dynamicValue的值为undefined  undefined!=null不成立 才会走else if条件
    if (dynamicValue != null) {
        // 处理绑定的属性值 绑定的属性值是可以使用过滤器的 parseFilters函数是用来解析过滤器的
        return parseFilters(dynamicValue)
        // 不全等意味着 getStatic这个参数 如果传 true或者不传 此else if条件分支会成立
    } else if (getStatic !== false) {
        //走到这个分支意味着获取绑定属性的值失败 因此继续尝试获取它非绑定属性的值 此时参数只传一个name 并调用getAndRemoveAttr
        const staticValue = getAndRemoveAttr(el, name)
        // 如果属性值存在 对属性值进行JSON.stringify处理 对非绑定的属性来讲保证它始终是个字符串
        // 因为编译器生成的渲染函数其实是字符串形式的渲染函数 它最终要通过new Function(str)才能变成真正的渲染函数
        // 代码一
        // const fn1 = new Function('console.log(1)')
        // // 代码二
        // const fn2 = new Function(JSON.stringify('console.log(1)'))
        // 如上代码等价：
        // // 代码一
        // const fn1 = function () {
        //   console.log(1)
        // }
        // // 代码二
        // const fn2 = function () {
        //   'console.log(1)'
        // }
        // 当你执行 f1() 函数时，在控制台会得到输出数字 1，而当你执行 fn2 函数时则不会得到任何输出，
        if (staticValue != null) {
            return JSON.stringify(staticValue)
            // 使用JSON.stringify的原因是确保非绑定属性的值始终是一个字符串而非一个表达式
        }
    }
}

// note: this only removes the attr from the Array (attrsList) so that it
// doesn't get processed by processAttrs.
// By default it does NOT remove it from the map (attrsMap) because the map is
// needed during codegen.
// getAndRemoveAttr除获取给定的属性值外还会将属性从attrsList中移除
// 还会有选择的将属性从attrsMap中移除
export function getAndRemoveAttr(
    el: ASTElement, //元素描述对象
    name: string, // 获取属性的名字
    removeFromMap ? : boolean //可选参数
) : ? string {
    let val
    // val变量保存的是要获取属性的值
    // 因为el的属性对象attrsMap中保存的是该元素所有属性的名值对对应表,因此获取属性指的方式是
    // 直接用获取属性的的名字和 attrsMap对象中的属性去匹配 并将匹配到的结果与null进行对比
    // 如果匹配结果不为null 说明能匹配到值
    // 如果 el.attrsMap[name] 的值为 undefined null 不进行删除操作 只返回 el.attrsMap[name]属性值
    if ((val = el.attrsMap[name]) != null) {
        const list = el.attrsList
        for (let i = 0, l = list.length; i < l; i++) {
            // 通过name找到attrsList中相应的数组元素 并将其移除
            if (list[i].name === name) {
                list.splice(i, 1)
                break
            }
        }
    }
    if (removeFromMap) { //如果removeFromMap为true
        //还会将该属性从 属性名值对列表中删除
        delete el.attrsMap[name]
    }
    // 最后返回name对应的属性值  如果属性值不存在 返回undefined
    return val
}

export function getAndRemoveAttrByRegex(
    el: ASTElement,
    name: RegExp
) {
    const list = el.attrsList
    for (let i = 0, l = list.length; i < l; i++) {
        const attr = list[i]
        if (name.test(attr.name)) {
            list.splice(i, 1)
            return attr
        }
    }
}

function rangeSetItem(
    item: any,
    range ? : { start ? : number, end ? : number }
) {
    if (range) {
        if (range.start != null) {
            item.start = range.start
        }
        if (range.end != null) {
            item.end = range.end
        }
    }
    return item
}
