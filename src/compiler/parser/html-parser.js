/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap,no} from 'shared/util'
import {isNonPhrasingTag} from 'web/compiler/util'
import {unicodeRegExp} from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
// \s 匹配空格 *匹配0个以上 . 匹配单个字符除了回车符\r 和换行符\n
// + 至少匹配一个
// ? 没有或者一个
// ()捕获和分组 这部分匹配到的结果会作为一个分组返回出来https://juejin.im/post/5aa797076fb9a028dc40b164
// []中的^ 是非得意思 匹配非[]中的字符
//[^\/]  “表示后面紧非 / 的字符。
// 匹配普通标签属性
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// attribute 一共有5个捕获分组
// [
//   'class="some-class"',
//   'class',
//   '=',
//   'some-class',
//   undefined,
//   undefined
// ]
// 从0-5一共有6个元素 第0个元素代表整个的正则匹配结果
// 1-5分别对应 5个捕获分组

// 匹配动态标签属性
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/

//source属性 返回用于返回模式匹配所用到的文本，不包括正则表达式直接量使用的界定符 也不包括 g m i
// ncname不带:号的XML 以字母或下划线开头 后面可以跟任意数量的中横线 数字 点 字母下划线等字符
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
const qnameCapture = `((?:${ncname}\\:) ?${ncname})`
// 开始标签的开头部分
const startTagOpen = new RegExp(`^<${qnameCapture}`)
// 开始标签的结尾部分 > 或者/>自闭合标签
// startTagClose拥有一个捕获分组 用来捕获开始标签结束部分的 斜杠
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being passed as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/
  // 可能是条件注释节点：<![ ]>

// Special Elements (can contain anything)
// isPlainTextELement 通过makeMap判断传入的标签是否是一个纯文本标签(包括script style textarea)
// isPlainTextElement是一个柯里化函数
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}
// decodingMap的key是html的实体 值则是实体对应的字符
const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n', //换行符
  '&#9;': '\t', // Tab的下一个指定位置 制表符
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
// isIgnoreNewLinetag用来检测给定的标签是否是 pre 或者textarea
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
// 用来检测是否应该忽略元素内容的第一个换行符
// pre 和 textarea标签会忽略其内容的第一个换行符
{/* <pre>内容</pre> */}
//等价
{/* <pre>
内容</pre> */}
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'
// https://juejin.im/post/5c6c18146fb9a049e232940c
// reolace 第一个参数是模式匹配正则  第二个参数是回调函数
// 回调函数的第一个参数是 匹配到的结果 回调函数对每一个匹配到的结果进行回调操作
// 回调函数接下来的参数是 匹配该模式中的某个圆括号子表达式的字符串 参数有一个或者多个
// 倒数第二个参数是匹配结果在字符串中的位置 
// 最后一个参数 是原字符串
function decodeAttr(value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

// parseHTML函数整体上分为三个部分
// 一、函数开头定义的一些常量变量
// 二、while循环
// 三、while循环之后定义的一些函数
export function parseHTML(html, options) {
  // stack用来维护DOM栈在while循环中处理html时每当遇到一个非一元标签,都会将开始标签push到该数组中
  const stack = []
  const expectHTML = options.expectHTML
  // no是一个始终返回false的函数
  // isUnaryTag用于检测是否是一元标签
  const isUnaryTag = options.isUnaryTag || no
  // canBeLeftOpenTag用于检测是否是一个可以省略闭合标签的非一元标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  // index当前html字符串的读入位置
  let index = 0
  // last储存剩余还未解析的html字符串 lastTag始终储存着位于stack栈顶的元素
  let last, lastTag
  // 开启一个while循环 循环结束的条件是 html为空 即html被parse解析完毕
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    if (!lastTag || !isPlainTextElement(lastTag)) {// 解析的内容不在在纯文本标签里
      let textEnd = html.indexOf('<')
      if (textEnd === 0) {
        // Comment:
        if (comment.test(html)) {
          // 注释节点以<!--开头 也要以-->结尾 否则不是注释节点 什么也不做
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            // 注释的钩子函数可以通过选项来配置只有options.shouldKeepComment为真是才会触发注释的钩子函数
            // 否则只截取字符串
            // options.shouldKeepComment的值就是 vue选项的comments值
            if (options.shouldKeepComment) {
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // 截取字符串
            advance(commentEnd + 3)
            // 结束当前循环开启下一次循环
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        // 匹配doctype节点
        // 如果匹配成功 doctypeMatch是一个数组 第一项是整个匹配项的字符串
        // 如果匹配不成功 doctypeMath的值是null
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        // 匹配结束标签
        // endTagMatch的匹配结果可能是 
        // endTagMatch = [
        //   '</div>',
        //   'div'
        // ]
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          // 如果有匹配值做两件事
          const curIndex = index
          //一截取模版
          advance(endTagMatch[0].length)
          //二,触发钩子函数 传入三个参数 第一个是结束标签名 第二个是 结束标签在原html字符串中的开始位置 第三个参数是结束标签在原html中的结束位置
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        // 判断剩余模版是否符合开始标签的规则只需要调用 parseStartTag(),它会解析开始标签如果返回undefine则说明它不符合开始标签的规则
        // 如果有返回结果 把解析出来的结果取出并调用开始标签的钩子函数
        const startTagMatch = parseStartTag()
        // 如果startTagMatch有返回值即为形式如下
        // {
        //   tagName:"div",
        //   attrs:[[
        //     ' class="box"', 'class', '=' null,null,null],
        //   ],[' id="el"','id','=','el',null,null]]
        // }
        if (startTagMatch) {
          // handleStartTag函数的目的是把tagName attrs unary等数据取出然后调用钩子函数将这些数据放到参数中
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      // textEnd>=0 有两种情况 
      // 一,html = '0<1<2'
      // 二,html = '<2'
      if (textEnd >= 0) {
        //截取<后的字符串 此时html 为 <1<2或者 <2
        rest = html.slice(textEnd)
        // 执行循环的条件是 剩下的字符串不能匹配成 结束标签 开始标签 注释标签 条件注释标签
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // 说明 此时< 存在于普通的文本中
          // < in plain text, be forgiving and treat it as text
          // indexOf()第二个参数 从指定位置开始索引 所以这句话的意思是 
          // 检索字符中下一个<的位置
          next = rest.indexOf('<', 1)
          // 如果没有找到 直接跳出循环
          if (next < 0) break
          // 更新textEnd的值 textEnd为下一个<的索引
          textEnd += next
          // 使用新的textEnd对原始字符串进行截取 并将截取的字符串赋值给rest变量
          rest = html.slice(textEnd)
          //进行循环直到能遇到一个能成功匹配的标签 或者 找不到下一个<为止
        }
        //当循环终止代码会继续执行 此时textEnd之前的字符串均为文本
        text = html.substring(0, textEnd)
      }

      if (textEnd < 0) {
        // 当textEnd小于0即没有< 此时把整个html字符串 当作文本来进行处理
        text = html
      }

      if (text) {
        advance(text.length)
      }

      // 如果options存在 且文本也存在 此时会调用chars钩子函数并把文本传递过去 
      if (options.chars && text) {
        // 传递文本 以及文本在html字符串中的开始和结束位置
        options.chars(text, index - text.length, index)
      }
    } else {// 解析的内容在纯文本标签里
      // 当栈中不为空 且栈顶元素为纯文本标签时会执行 以下代码
      // 在else分支里解析的是 纯文本标签的内容而不是纯文本标签
      let endTagLength = 0// 纯文本标签闭合标签的字符长度
      const stackedTag = lastTag.toLowerCase()//纯文本标签的小写版

      // new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      // \s匹配空白字符 \S匹配非空白字符 [\\s\\S]所以就是匹配所有的字符全集 用来匹配纯文本标签的内容
      //  后半部分用来匹配 纯文本标签的结束标签
      // *?表示懒匹配 只要后面的内容匹配成功 就立即停止
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      
      // rest保存剩余字符 把用reStackedTag匹配到的字符 替换成''
      // 如果html为 dddd</textarea> 则rest 为''
      // 如果html为 dddd</textarea>dddaer 则rest 为'dddaer'
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    // 当html为 <2 时即匹配不到标签 也没有下一个< 此时循环终止 last==html成立
    // html中的<2在循环中没有人处理 last是html中剩余未处理的字符串
    if (html === last) {
      // <2会被作为普通字符串进行处理
      options.chars && options.chars(html)
      //当栈被清空时 此时还有剩余字符串 如<2会提示错误
      // 如<div></div><a  div解析完毕栈会清空 此时字符串中只剩下<a没有处理
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        // 模版末尾标记错误
        options.warn(`Mal-formatted tag at end of template: "${html}"`, {
          start: index + html.length
        })
      }
      break
    }
  }

  // Clean up any remaining tags
  // 清除stack栈中剩余未处理的标签
  parseEndTag()

  function advance(n) {
    index += n
    html = html.substring(n)
  }


  // 截取开始标签,并解析其属性以及自闭合标签
  // 开始标签包括标签名,属性和结尾
  function parseStartTag() {
    const start = html.match(startTagOpen)

    // match如果匹配不到就返回null 匹配到 match==["<div","div",index:0,input:"<div></div>"]
    // 它匹配的是开始标签的一部分 不包括 属性 和结尾
    if (start) {
      const match = {
        tagName: start[1], //标签名
        attrs: [],//这个空数组用来储存将来有可能被匹配到的属性
        start: index // 开始位置 当前字符流读入的位置在整个html字符串中的相对位置
      }
      advance(start[0].length)
      // 截取开始标签后 html就是这样的形式:' class="box" id="el"></div>'
      let end, attr
      //  不符合开始标签的结尾部分 且符合标签属性的特征 执行循环依次解析标签属性
      // !(end=html.match(startTagClose))没有匹配到开始标签的结束部分并把匹配结果赋值给end
      

      // 没有匹配到开始标签的结束部分且匹配到了开始标签的属性 这个时候循环开始执行,直到遇到结束标签为止
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        // 记录属性在html中的开始位置
        attr.start = index
        advance(attr[0].length)
        // 记录属性在html中的结束位置
        attr.end = index
        match.attrs.push(attr)
      }
      // 解析完标签属性后 目前模板是'></div>' 或者/>自闭合标签
      // 匹配到标签的结尾部分
      if (end) {
        // 如果匹配到自闭合标签end[1]为 正则表达式中（）的分组项 / 匹配不上为undefined
        match.unarySlash = end[1]
        advance(end[0].length)
        // 标记结束位置
        match.end = index
        return match
      }
    }
  }

  function handleStartTag(match) {
    // 获取标签名
    const tagName = match.tagName
    // 是否是自闭合标签
    const unarySlash = match.unarySlash

    if (expectHTML) {
      // 段落式元素
      // 最近一次遇到的开始标签即 栈顶元素是p标签
      // 并且当前正在解析的开始标签不能是段落式标签 因为p标签只允许包含段落式内容模型
      // <p><h2></h2></p>会被解析成<p></p><h2></h2><p></p>
      // h2不是段落式内容 会立即调用闭合函数关闭标签
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      // 如果遇到的是一个可以省略闭合标签的元素且下次遇到的标签也是这个标签时 直接调用闭合函数关闭标签
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    // 判断一个标签是否是一元标签 如果是自定义组件标签如<my-component />
    // 我们判断不出来 因此还需要 用unarySlash来判断
    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs = new Array(l)

    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href' ?
        options.shouldDecodeNewlinesForHref :
        options.shouldDecodeNewlines
        // 格式化match中attrs中的元素
        attrs[i] = {
        name: args[1],// 属性名
        value: decodeAttr(value, shouldDecodeNewlines)// value属性值 并对属性value进行html实体解码
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    if (!unary) {// 如果不是一元标签 把该开始标签放入栈中
      stack.push({
        tag: tagName,// 标签名
        lowerCasedTag: tagName.toLowerCase(),// 小写的标签名
        attrs: attrs,// 属性
        start: match.start,// 开始标签的在原html中的开始位置
        end: match.end// 开始标签在原html中的结束位置
      })
      lastTag = tagName
    }

    if (options.start) {
      // 如果options有start选项 调用start钩子函数 传入标签名 属性值 是否是一元标签 开始标签在html中开始和结束位置
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  // 解析结束标签
  // parseEndTag函数有三种作用
  // 1,检测是否缺少闭合标签(只传一个参数)
  // 2,处理stack栈中剩余未处理的标签(不传参数)
  // 3,解析,</br>和</p>标签  和浏览器行为一致
  function parseEndTag(tagName, start, end) {
    // pos用于判断html字符串是否缺少结束标签
    // lowerCasedTagName用于存储tagName的小写版
    let pos, lowerCasedTagName
    // 如果start和end不存在把这个值设置为当前字符流的读入位置
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    if (tagName) {
      // 如果标签存在把 标签的小写版存入lowerCasedTagName
      lowerCasedTagName = tagName.toLowerCase()
      // 循环栈 找出与当前正在解析的结束标签对应的开始标签在栈中的位置
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
         
          break
        }
        // 当在栈中找不到与结束标签对应的开始标签 pos会为-1
      }
       // break立即跳出循环 因此当前pos的值 就是 stack[pos]中的pos值
    } else {
      // 没有结束标签为0
      // If no tag name is provided, clean shop
      pos = 0

     // 当pos等于0 即没有传入tagName标签 此时处理 stack栈中剩余的标签
    }


    if (pos >= 0) {
      // Close all the open elements, up the stack
      for (let i = stack.length - 1; i >= pos; i--) {
        // 当i>pos时 说明栈中一定缺少闭合标签 栈中从i开始的位置全都 缺少闭合标签

        // 没有tagName说明 stack中全部都缺少闭合标签 这个时候会逐一警告这些标签 提示栈中缺少闭合标签,并进行相应处理
        // 并调用options.end将其闭合
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`, {
              start: stack[i].start,
              end: stack[i].end
            }
          )
        }
        //调用end钩子函数 让其立即闭合 这是为了保证解析结果的正确性
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // 把栈中和结束标签对应的开始开始标签解析完后 从栈中移除,并将栈顶元素指到下一位
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag

      //pos为-1小于0 即只有结束标签
    } else if (lowerCasedTagName === 'br') {
      // 对于</br>标签会解析为正常的<br>
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      // 对于</p>标签会解析为正常的<p>
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
    // 当只要结束标签 且标签不为 br 和p时浏览器会默认忽略
    // 对于其他标签会忽略 所以vue的parse与浏览器行为一致
  }
}
