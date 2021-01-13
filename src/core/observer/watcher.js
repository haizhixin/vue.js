/* @flow */

import {
    warn,
    remove,
    isObject,
    parsePath,
    _Set as Set,
    handleError,
    noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
    vm: Component;
    expression: string;
    cb: Function;
    id: number;
    deep: boolean;
    user: boolean;
    lazy: boolean;
    sync: boolean;
    dirty: boolean;
    active: boolean;
    deps: Array < Dep > ;
    newDeps: Array < Dep > ;
    depIds: SimpleSet;
    newDepIds: SimpleSet;
    before: ? Function;
    getter: Function;
    value: any;

    // computed: {
    //   B:function() {
    //     return C
    //   }
    // },

    // 对于计算属性的watcher 参数为 vm  expOrFn=Bfn cb =null options ={ lazy: true }
    constructor(
        vm: Component,
        expOrFn: string | Function,
        cb: Function,
        options ? : ? Object,
        isRenderWatcher ? : boolean
    ) {
        this.vm = vm
        if (isRenderWatcher) {
            vm._watcher = this
        }
        vm._watchers.push(this)
        // options
        if (options) {
            this.deep = !!options.deep
            this.user = !!options.user
            this.lazy = !!options.lazy
            this.sync = !!options.sync
            this.before = options.before
        } else {
            this.deep = this.user = this.lazy = this.sync = false
        }
        this.cb = cb
        this.id = ++uid // uid for batching
        this.active = true
        // 初始化计算属性时 this.dirty = this.lazy = true
        this.dirty = this.lazy // for lazy watchers
        this.deps = []
        this.newDeps = []
        this.depIds = new Set()
        this.newDepIds = new Set()
        this.expression = process.env.NODE_ENV !== 'production' ?
            expOrFn.toString() :
            ''
        // parse expression for getter
        if (typeof expOrFn === 'function') {
            this.getter = expOrFn
        } else {
            this.getter = parsePath(expOrFn)
            if (!this.getter) {
                this.getter = noop
                process.env.NODE_ENV !== 'production' && warn(
                    `Failed watching path: "${expOrFn}" ` +
                    'Watcher only accepts simple dot-delimited paths. ' +
                    'For full control, use a function instead.',
                    vm
                )
            }
        }
        // 对于计算属性的Watcher在实例化时不会立即进行求值 除此之外 其他的Watcher在实例化时会对其立即求值
        this.value = this.lazy ?
            undefined :
            this.get()
    }

    // 每一个计算属性的wather 初始化后
    // this.dirty = true;
    // this.lazy = true;
    // this.getter = Bfn;
    // this.value = undefined;



    /**
     * Evaluate the getter, and re-collect dependencies.
     */

    // 依赖收集的过程
    get() {
        pushTarget(this)
        let value
        const vm = this.vm
        try {
            value = this.getter.call(vm, vm) // getter为渲染函数 或者parsePath返回的求值函数 //次函数执行会触发 该属性的get()方法
        } catch (e) {
            if (this.user) {
                handleError(e, vm, `getter for watcher "${this.expression}"`)
            } else {
                throw e
            }
        } finally {
            // "touch" every property so they are all tracked as
            // dependencies for deep watching
            if (this.deep) {
                traverse(value)
            }
            popTarget()
            this.cleanupDeps()
        }
        return value
    }

    /**
     * Add a dependency to this directive.
     */
    addDep(dep: Dep) {
        const id = dep.id

        if (!this.newDepIds.has(id)) { // newDepIds用于一次求值时避免重复收集依赖
            this.newDepIds.add(id)
            this.newDeps.push(dep)
            if (!this.depIds.has(id)) { // depIds用于多次求值时避免重复收集依赖
                dep.addSub(this)
            }
        }
    }

    /**
     * Clean up for dependency collection.
     */
    cleanupDeps() {
        let i = this.deps.length
        while (i--) {
            const dep = this.deps[i]
            if (!this.newDepIds.has(dep.id)) {
                dep.removeSub(this)
            }
        }
        let tmp = this.depIds
        this.depIds = this.newDepIds
        this.newDepIds = tmp
        this.newDepIds.clear()
        tmp = this.deps
        this.deps = this.newDeps
        this.newDeps = tmp
        this.newDeps.length = 0
    }

    /**
     * Subscriber interface.
     * Will be called when a dependency changes.
     */
    // 触发依赖的过程
    update() {
        /* istanbul ignore else */
        if (this.lazy) {
            this.dirty = true
        } else if (this.sync) {
            this.run()
        } else {
            queueWatcher(this)
        }
    }

    /**
     * Scheduler job interface.
     * Will be called by the scheduler.
     */
    // 真正的更新变化操作是在run方法中完成的
    run() {
        if (this.active) {
            // 由于渲染函数 updateComponent执行后永远返回undefined所以渲染函数重新求值后不会执行if代码块里的代码
            const value = this.get()
            if (
                value !== this.value ||
                // Deep watchers and watchers on Object/Arrays should fire even
                // when the value is the same, because the value may
                // have mutated.
                isObject(value) ||
                this.deep
            ) {
                // set new value
                const oldValue = this.value
                this.value = value
                if (this.user) {
                    try {
                        this.cb.call(this.vm, value, oldValue)
                    } catch (e) {
                        handleError(e, this.vm, `callback for watcher "${this.expression}"`)
                    }
                } else {
                    this.cb.call(this.vm, value, oldValue)
                }
            }
        }

    }

    /**
     * Evaluate the value of the watcher.
     * This only gets called for lazy watchers.
     */
    evaluate() {
        this.value = this.get()
        this.dirty = false
    }

    /**
     * Depend on all deps collected by this watcher.
     */
    depend() {
        let i = this.deps.length
        while (i--) {
            this.deps[i].depend()
        }
    }

    /**
     * Remove self from all dependencies' subscriber list.
     */
    teardown() {
        if (this.active) {
            // remove self from vm's watcher list
            // this is a somewhat expensive operation so we skip it
            // if the vm is being destroyed.
            if (!this.vm._isBeingDestroyed) {
                //将该观察者实例从当前组件中的watchers移除
                remove(this.vm._watchers, this)
            }
            let i = this.deps.length
            while (i--) {
                //将当前观察者实例从属性的dep实例中清除
                this.deps[i].removeSub(this)
            }
            this.active = false
        }
    }
}
