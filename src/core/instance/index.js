import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// Vue构造函数
// 定义Vue构造函数 为原型添加属性和方法 即实例属性和实例方法
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
    // instanceof操作符：左侧是一个普通对象 右侧是一个函数
    // 表示 在 this的整个原型链中 是否有 vue.prototype指向的对象
    // 他只能处理对象和函数之间的关系 不能处理 两个普通对象之间的关系
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // Vue父类上的_init方法 通过Vue.extend创建子类时 会继承该方法 
  this._init(options)

  // new 调用构造函数 会执行以下四步
  // 1,创建一个新对象
  // 2,这个新对象会执行原型链连接
  // 3,这个新对象会绑定到函数调用的this
  // 4,如果函数没有返回其他对象，那么new表达式中的函数调用会自动返回这个对象
}
// 当调用 Vue构造函数之后 紧接着会进行以下5步操作:
// 把Vue构造函数作为参数 传入以下方法,目的向Vue的原型上挂载方法
initMixin(Vue)// 
// 主要有三个数据相关的实例方法 $set $watch $delete 
stateMixin(Vue)// 2
// 事件相关的实例方法 $on $once $off  $emit
eventsMixin(Vue)// 3
lifecycleMixin(Vue)// 3
renderMixin(Vue)// 3

export default Vue
