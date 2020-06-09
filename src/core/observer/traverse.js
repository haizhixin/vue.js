/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }

  // 用来判断 val.__ob__ 是否有值，我们知道如果一个响应式数据是对象或数组，那么它会包含一个叫做 __ob__ 的属性，这时我们读取 val.__ob__.dep.id 作为一个唯一的ID值，并将它放到 seenObjects 中：seen.add(depId)，这样即使 val 是一个拥有循环引用的对象，当下一次遇到该对象时，我们能够发现该对象已经遍历过了：seen.has(depId)，这样函数直接 return 即可。
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  // 以上就是深度观测的实现以及避免循环引用造成的死循环的解决方案。
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
