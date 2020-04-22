/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

// 对vue进行第三次包装 该文件也是vue的入口文件
const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})
// 保存Vue上的$mount
const mount = Vue.prototype.$mount
// 定义Vue上的$mount方法 该方法需要两个可选的形参
Vue.prototype.$mount = function (
  el?: string | Element,//字符串或者dom元素
  hydrating?: boolean
): Component {
  el = el && query(el)

  /* istanbul ignore if */
  // document.body属性返回<body>元素
  // document.documentElement属性返回<html>元素
  //不要把Vue实例挂在到body元素或者html元素上 要挂载到一个普通的元素上
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve(解决处理) template/el and convert(转换) to render function
  if (!options.render) {// 如果选项中有render函数直接执行 说明render函数的优先级最高
    let template = options.template// 其次是template
    if (template) {
      if (typeof template === 'string') {//template值是一个选择器
        // charAt()//返回指定索引处的字符
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {//节点类型 template的值是一个节点
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid(无效的,不能识别的) template option:' + template, this)
        
        }
        return this
      }
    } else if (el) {// 最后是el
      template = getOuterHTML(el)
    }
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns



      const { render, staticRenderFns } = compileToFunctions(template, {}, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML//设置获取该对象及其内容的HTML形式
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML//设置或获取位于对象起始和结束标签内的HTML
  }
}

Vue.compile = compileToFunctions

export default Vue
