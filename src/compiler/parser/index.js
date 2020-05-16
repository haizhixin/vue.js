/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize, hyphenate } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
    addProp,
    addAttr,
    baseWarn,
    addHandler,
    addDirective,
    getBindingAttr,
    getAndRemoveAttr,
    getRawBindingAttr,
    pluckModuleFunction,
    getAndRemoveAttrByRegex
} from '../helpers'

// 检测标签属性名是否是监听事件的指令
export const onRE = /^@|^v-on:/
// 检测标签属性名是否是指令
// v-开头的属性都被认为是指令 @是v-on的缩写 :是v-bind的缩写
// #是v-slot的缩写
export const dirRE = process.env.VBIND_PROP_SHORTHAND ?
    /^v-|^@|^:|^\.|^#/ :
    /^v-|^@|^:|^#/

// \s匹配空白字符 \S匹配非空白字符 [\s\S]匹配任何字符
// ? 放在* +后面 表示匹配尽可能少的字符串 懒匹配
// ?:代表非捕获分组
//  forAliasRE用来匹配 v-for属性值  并捕获 in 或者of后面的值
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/
// forIteratorRE用来匹配 forAliasRE第一个捕获到的捕获分组
// 三个捕获分组
// 一, 除了 , } ]
// 二, 不是捕获分组
// 三,  除了, } ]
// 如 <div v-for="(value, key, index) in object"></div>
// 用forAlisaRE匹配以上字符串去掉 括号 第一个捕获组结果是 value, key,index
// 用forIteratorRE匹配  forIterator的第一个捕获组 为 key forIterator的第二个捕获组 是index
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
// stripParensRE用来匹配以( 开头 或者以)结尾 或者两者都满足
// 作用是去掉 forAlisaRE的匹配结果中的 ()
// 实现方式如下 '(value, key, index)'.replace(stripParensRE,"")
const stripParensRE = /^\(|\)$/g
// 匹配 以[开始 以]结尾 中间是 除了换行符\n以外的任何单子符
const dynamicArgRE = /^\[.*\]$/

// 用来匹配指令中的参数 如<div v-on:click.stop="handleClick"></div>
// 匹配:click.stop 并且拥有一个捕获组 捕获组为参数名字
const argRE = /:(.*)$/
// 以:或者.或者v-bind:开始
export const bindRE = /^:|^\.|^v-bind:/
// 以.开始
const propBindRE = /^\./
//?=n 量词匹配任何其后紧接指定字符串 n 的字符串。
// modifierRE匹配修饰符
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g
//以 v-slot:开始 或者v-slot结束 或者以#开始
const slotRE = /^v-slot(:|$)|^#/
// 匹配回车换行
const lineBreakRE = /[\r\n]/
// 匹配一个或者多个空白字符
const whitespaceRE = /\s+/g
//  匹配 空白字符 单引号 双引号 < > 左斜线 等于号
const invalidAttributeRE = /[\s"'<>\/=]/
// cached函数 接收一个函数参数 并返回一个和函数参数一模一样的函数 唯一的区别是新返回的函数具有缓存功能
// 如果一个函数接收相同参数的情况下 总返回相同的值 cached函数将会为该函数提供性能上的优势
// he.decode函数用于HTML字符实体的解码工作
// console.log(he.decode('&#x26;'))  // &#x26; -> '&'
// &#x26;代表字符实体 通过he.decode解码为 &字符
// decodeHTMLCached用于对纯文本的解码 如果不进行解码那么用户无法使用字符实体 进行编码
const decodeHTMLCached = cached(he.decode)

export const emptySlotScopeToken = `_empty_`

// configurable state
// 定义平台化选项变量
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace
let maybeComponent

// 创建一个元素的描述对象的函数
// 接收三个参数
// 一:标签名
// 二:标签的属性数组
// 三:当前标签的父标签的描述对象的引用
export function createASTElement(
    tag: string,
    attrs: Array < ASTAttr > ,
    parent: ASTElement | void
): ASTElement {
    return {
        type: 1,
        tag,
        attrsList: attrs, //attrsList原始的标签属性数组
        attrsMap: makeAttrsMap(attrs), // makeAttrsMap将原始的标签属性数组转化为 名值对一一对应的对象
        rawAttrsMap: {},
        parent,
        children: []
    }
}

/**
 * Convert HTML string to AST.
 */
// 解析模版字符串最终生成AST
// AST节点分为三种类型
// type =1;元素节点 type=2;文本节点 type=3 注释节点
export function parse(
    template: string,
    options: CompilerOptions
): ASTElement | void {
    //初始化8个平台化变量值为编译器的选项参数  不同的平台下的编译器选项参数不同 因此8个平台化的变量在不同的平台下 其值不同
    warn = options.warn || baseWarn
    // no是一个传入任何值都返回false的函数

    //options选项参数 isPreTag函数 判断一个标签是否是pre标签
    platformIsPreTag = options.isPreTag || no
    // mustUseProp检测一个属性在标签中是否需要使用元素对象原生的属性进行绑定
    platformMustUseProp = options.mustUseProp || no
    // 获取元素的命令空间
    platformGetTagNamespace = options.getTagNamespace || no
    // 检查给定的标签是否是保留标签
    const isReservedTag = options.isReservedTag || no
    maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)

    //options.modules中只有前两个参数有transformNode transforms最终的值为 [transformNode,transformNode]
    transforms = pluckModuleFunction(options.modules, 'transformNode')
    //options.modules中只有最后一个参数有preTransformNode preTansforms 最终值 [preTransformNode]
    preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
    // options.modules中没有 postTransformNode postTransforms最终值为[]
    postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

    // 创建vue实例对象时所传递的dlimiters选项 它的值是一个数组
    // 改变纯文本插入分隔符
    delimiters = options.delimiters

    const stack = [] // stack 用来修正当前正在解析元素的父级
    // options.preserveWhitespace 编译器选项 用来告诉编译器 当编译html字符串时是否放弃标签之间的空格 true代表放弃
    const preserveWhitespace = options.preserveWhitespace !== false
    const whitespaceOption = options.whitespace
    // 最终生成的AST
    let root
    // 当前父元素 元素描述对象之间的父子关系 就是靠此变量进行联系的
    let currentParent
    // inVpre当前解析的标签是否在拥有v-pre属性的标签内
    let inVPre = false
    // inPre当前解析的标签 是否在<pre></pre>标签内
    let inPre = false

    let warned = false
    //warnOnce打印一次警告
    function warnOnce(msg, range) {
        if (!warned) {
            warned = true
            // 打印警告信息也是靠warn函数实现
            warn(msg, range)
        }
    }

    // 二元标签的结束标签或者一元标签 调用闭合函数
    function closeElement(element) {
        trimEndingWhitespace(element)

        // element.processed属性标识该元素是否已经解析过 如果解析过 processed属性值为true
        //该属性是在元素描述对象应用preTransforms数组中的处理函数时添加的
        if (!inVPre && !element.processed) {
            // 如果当前环境不在pre环境中 且该元素不是元素没有被解析过 就调用processElementh函数
            // 其中processElement函数就是一系列process处理函数的集合
            element = processElement(element, options)
        }
        // tree management
        // 如果stack栈为空 说明整个html模版字符串已经被解析完毕 但这个时候start钩子函数仍然被调用
        // 说明模版中存在多个根元素
        // 且当前元素不是根元素
        if (!stack.length && element !== root) {
            // allow root elements with v-if, v-else-if and v-else
            // 我们可以定义多个根元素 只要能够保证最终只渲染一个即可,因此我们可以利用 v-if v-else-if v-else实现
            // .if .elseif .else属性是通过processIf函数处理元素描述对象时如果发现元素的属性中有v-if v-else-if v-else
            // 则会在元素的描述对象上添加相应的属性 作为标识
            // 无论定义多少个根元素 root变量始终存储着第一个根元素的描述对象 element当前元素描述对象,非第一个根元素描述对象
            // 第一个根元素描述对象有v-if指令 且其他根元素有 v-else-if 或者v-else属性 这样才能保证被渲染的根元素只有一个
            if (root.if && (element.elseif || element.else)) {
                // 检查根元素是否符合要求
                if (process.env.NODE_ENV !== 'production') {
                    checkRootConstraints(element)
                }
                // root根元素描述对象
                addIfCondition(root, {
                    exp: element.elseif, // 当前元素的elseif属性
                    block: element // 当前元素
                })
            } else if (process.env.NODE_ENV !== 'production') {
                // 如果不满足以上条件将对开发者进行友好的警告提示
                warnOnce(
                    `Component template should contain exactly one root element. ` +
                    `If you are using v-if on multiple elements, ` +
                    `use v-else-if to chain them instead.`, { start: element.start }
                )
            }
        }

        // 当前元素存在父级  且当前元素不是被禁止的元素
        if (currentParent && !element.forbidden) {
            if (element.elseif || element.else) {
                // 把使用v-else-if 或者v-else指令的标签添加到使用了v-if指令的元素描述对象的ifConditions
                processIfConditions(element, currentParent)
                // 由此可知 当一个元素使用了v-else-if或者v-else时它不会作为父级元素子节点的
                // 而是会被添加到相符的使用了v-if指令的元素描述对象的ifConditions数组中
            } else {
                // 如果当前元素没有使用v-else-if 或者v-else
                //判断是否使用了slotScope特性
                if (element.slotScope) {
                    // scoped slot
                    // keep it in the children list so that v-else(-if) conditions can
                    // find it as the prev node.
                    // 如果使用了slotScope 会把它添加到父级元素描述对象的scopedSlots下
                    const name = element.slotTarget || '"default"';
                    (currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
                }
                // 把当前元素加入到父级元素描述对象的children中
                currentParent.children.push(element)
                // 当前元素的parent属性指向其父级元素对象
                element.parent = currentParent
                // 这样就建立了元素描述对象间的父子关系
            }
        }

        // final children cleanup
        // filter out scoped slots
        element.children = element.children.filter(c => !(c: any).slotScope)
        // remove trailing whitespace node again
        trimEndingWhitespace(element)

        // check pre state
        if (element.pre) {
            inVPre = false
        }
        if (platformIsPreTag(element.tag)) {
            inPre = false
        }

        // apply post-transforms
        //后置处理
        for (let i = 0; i < postTransforms.length; i++) {
            postTransforms[i](element, options)
        }
    }

    function trimEndingWhitespace(el) {
        // remove trailing whitespace node
        if (!inPre) {
            let lastNode
            while (
                (lastNode = el.children[el.children.length - 1]) &&
                lastNode.type === 3 &&
                lastNode.text === ' '
            ) {
                el.children.pop()
            }
        }
    }

    // checkRootConstraints检查根元素是否符合要求
    function checkRootConstraints(el) {
        // 根元素的限制条件是 必须保证有且仅有一个根元素
        // 根元素不能使用 slot标签 和template
        // slot作为插槽 它的内容是由外界决定的 而插槽的内容很有可能渲染多个节点
        // template 本身作为抽象组件不会渲染任何内容到页面中 因此它里面也有可能包含多个子节点
        if (el.tag === 'slot' || el.tag === 'template') {
            // 利用warnOnce函数只打印一次警告
            // 目的是每次只提示一个编译错误给用户 避免多次打印不同错误给用户造成迷惑 这是出于对开发者解决问题有好的考虑
            warnOnce(
                `Cannot use <${el.tag}> as component root element because it may ` +
                'contain multiple nodes.', { start: el.start }
            )
        }
        // 也不能使用带有v-for属性的标签
        // v-for指令会渲染多个节点 因此根元素不能使用v-for指令
        if (el.attrsMap.hasOwnProperty('v-for')) {
            warnOnce(
                'Cannot use v-for on stateful component root element because ' +
                'it renders multiple elements.',
                el.rawAttrsMap['v-for']
            )
        }
    }

    // 主要通过调用parseHTML函数对模板字符串进行解析
    // 实际上parseHTML函数的作用就是用来做词法分析的
    // 而parse函数的主要作用是在词法分析的基础上做句法分析从而生成一颗AST
    // 构建AST最关键的选项是 start end chars comment四个钩子函数
    parseHTML(template,
    {
        warn,
        expectHTML: options.expectHTML,
        isUnaryTag: options.isUnaryTag,
        canBeLeftOpenTag: options.canBeLeftOpenTag,
        shouldDecodeNewlines: options.shouldDecodeNewlines,
        shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
        shouldKeepComment: options.comments,
        outputSourceRange: options.outputSourceRange,
        //开始标签的钩子函数
        start(tag, attrs, unary, start, end) {
            // 在start钩子函数中 当前解析阶段就是遇到一个开始标签的阶段
            // 因此我们可以把开始标签称为 当前元素;把当前元素的父标签称为 父级元素
            // check namespace.
            // inherit parent ns if there is one
            // 获取当前元素的命名空间 只有svg 和math有 命名空间
            // 如果有父级元素且父级元素有命名空间 就采用父级元素的命名空间 否则 就调用platformGetTagNamespace()函数进行获取
            const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

            // handle IE svg bug
            /* istanbul ignore if */
            if (isIE && ns === 'svg') {
                // 利用guardIBSVGBUG处理 svg在IE下的bug
                attrs = guardIESVGBug(attrs)
            }

            // 为当前元素创建了描述对象
            // 把当前标签的元素描述对象赋值给element
            let element: ASTElement = createASTElement(tag, attrs, currentParent)
            if (ns) {
                //如果有命名空间 在当前标签的描述对象上添加ns 其属性值为命名空间的值
                element.ns = ns
                // 因此如果解析出的是 svg math或者其子标签 会比其他标签多出一个ns属性
            }

            if (process.env.NODE_ENV !== 'production') {
                if (options.outputSourceRange) {
                    element.start = start
                    element.end = end
                    element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
                        cumulated[attr.name] = attr
                        return cumulated
                    }, {})
                }
                attrs.forEach(attr => {
                    if (invalidAttributeRE.test(attr.name)) {
                        warn(
                            `Invalid dynamic argument expression: attribute names cannot contain ` +
                            `spaces, quotes, <, >, / or =.`,
                            {
                                start: attr.start + attr.name.indexOf(`[`),
                                end: attr.start + attr.name.length
                            }
                        )
                    }
                })
            }

            // 在非服务端渲染的情况下 当前元素是否是被禁止的标签
            // 被禁止的标签是 style 和script  因为vue认为 模版只应该负责数据状态到UI的渲染
            // 而不应该存在引起副作用的代码
            // 如果你的模板中存在 <script> 标签，那么该标签内的代码很容易引起副作用。但有一种情况例外，比如其中一种定义模板的方式为：
            // <script type="text/x-template" id="hello-world-template">
            //   <p>Hello hello hello</p>
            // </script>

            // isForbiddenTag返回true 说明该标签是禁止标签
            if (isForbiddenTag(element) && !isServerRendering()) {
                // 当前元素会被标记为禁止标签
                element.forbidden = true
                process.env.NODE_ENV !== 'production' && warn(
                    'Templates should only be responsible for mapping the state to the ' +
                    'UI. Avoid placing tags with side-effects in your templates, such as ' +
                    `<${tag}>` + ', as they will not be parsed.', { start: element.start }
                )
            }

            // apply pre-transforms
            // 前置处理
            for (let i = 0; i < preTransforms.length; i++) {
                // preTransforms中函数接收两个参数 当前元素描述对象 和编译器选项
                // preTransforms 和 transforms、postTransforms 和process系列函数没有什么区别
                // 都是为了对当前元素的描述对象进行进一步处理 之所以把他们和process系列函数区分开 就是出于平台化的考虑
                // 我们知道这些函数 来自不同的平台
                element = preTransforms[i](element, options) || element
            }

            // 接下来就是调用process系列函数 使得该元素描述对象更好的描述一个标签
            // 也就是说在当前元素描述对象上添加各种各样的具有标识作用的属性
            // 如果当前解析工作已经处于v-pre环境下了 则不需要再次执行if语句块的代码了
            if (!inVPre) {
                // 如果一个标签使用了v-pre属性 经processPre处理后该元素描述对象的属性.pre为true
                processPre(element)
                // 如果元素描述对象的.pre属性为true 那么inVPre也设为true
                if (element.pre) {
                    inVPre = true
                }
            }
            // 判断一个标签是否是<pre>标签
            if (platformIsPreTag(element.tag)) {
                // 如果是pre标签 把inPre设置为true
                inPre = true

                //<pre>标签的解析行为与其他html标签的解析行为是不同的
                // 区别：1,<pre>标签会对其所包含的html字符实体进行解码
                //   2,<pre>标签会保留html字符串编写时的空白
            }
            // inVPre为true当前环境在 v-pre环境下
            // 我们知道使用v-pre指令的标签及其子标签的解析行为是不一致的
            // 编译器会跳过使用了v-pre指令元素及其子元素的编译工作
            if (inVPre) {
                // 直接使用processRawAttrs函数对元素描述对象进行加工
                processRawAttrs(element)
            } else if (!element.processed) { //元素描述对象的processed是一个布尔值 它标识着当前元素是否已经被解析过
                // 如果当前元素没有处于v-pre的环境中 会调用一系列process函数进行处理元素描述对象
                // structural directives
                // 结构化指令 包括v-for v-if v-else-if v-else v-once
                processFor(element)
                // 处理使用了条件指令的标签的元素描述对象
                processIf(element)
                //处理使用了v-Once指令的标签的元素描述对象
                processOnce(element)
            }

            //root变量在一开始是不存在的
            if (!root) {
                // 如果不存在根元素把当前元素作为根元素
                //  element为当前元素的描述对象
                root = element
                // 非生产环境下检查根元素是否符合要求
                if (process.env.NODE_ENV !== 'production') {
                    checkRootConstraints(root)
                }
            }

            if (!unary) { // 如果不是一元标签
                // 把currentParent当前父元素的变量值更新为当前元素描述对象
                // currentParent始终存储的是stack栈顶的元素,即当前解析元素的父级
                currentParent = element
                // 把当前元素推入栈中
                stack.push(element)
            } else { //如果是一元标签 调用闭合标签函数
                closeElement(element)
            }
        },
        // 结束标签的钩子函数
        end(tag, start, end) {
            const element = stack[stack.length - 1]
            // pop stack
            stack.length -= 1
            currentParent = stack[stack.length - 1]
            if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
                element.end = end
            }
            closeElement(element)
        },
        // 纯文本钩子函数
        chars(text: string, start: number, end: number) {
            if (!currentParent) {
                if (process.env.NODE_ENV !== 'production') {
                    if (text === template) {
                        warnOnce(
                            'Component template requires a root element, rather than just text.', { start }
                        )
                    } else if ((text = text.trim())) {
                        warnOnce(
                            `text "${text}" outside root element will be ignored.`, { start }
                        )
                    }
                }
                return
            }
            // IE textarea placeholder bug
            /* istanbul ignore if */
            if (isIE &&
                currentParent.tag === 'textarea' &&
                currentParent.attrsMap.placeholder === text
            ) {
                return
            }
            const children = currentParent.children
            if (inPre || text.trim()) {
                text = isTextTag(currentParent) ? text : decodeHTMLCached(text)
            } else if (!children.length) {
                // remove the whitespace-only node right after an opening tag
                text = ''
            } else if (whitespaceOption) {
                if (whitespaceOption === 'condense') {
                    // in condense mode, remove the whitespace node if it contains
                    // line break, otherwise condense to a single space
                    text = lineBreakRE.test(text) ? '' : ' '
                } else {
                    text = ' '
                }
            } else {
                text = preserveWhitespace ? ' ' : ''
            }
            if (text) {
                if (!inPre && whitespaceOption === 'condense') {
                    // condense consecutive whitespaces into single space
                    text = text.replace(whitespaceRE, ' ')
                }
                let res
                let child: ? ASTNode
                if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
                    child = {
                        type: 2,
                        expression: res.expression,
                        tokens: res.tokens,
                        text
                    }
                } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
                    child = {
                        type: 3,
                        text
                    }
                }
                if (child) {
                    if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
                        child.start = start
                        child.end = end
                    }
                    children.push(child)
                }
            }
        },
        // 注释节点钩子函数
        comment(text: string, start, end) {
            // adding anyting as a sibling to the root node is forbidden
            // comments should still be allowed, but ignored
            if (currentParent) {
                const child: ASTText = {
                    type: 3,
                    text,
                    isComment: true
                }
                if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
                    child.start = start
                    child.end = end
                }
                currentParent.children.push(child)
            }
        }
    })
    return root
}

function processPre(el) {
    // 如果getAndRenoveAttr的返回值 不等于null
    // 获取v-pre属性的值
    // 使用v-pre属性时不需要指定值 所以属性值为""
    if (getAndRemoveAttr(el, 'v-pre') != null) {
        //为当前元素描述对象添加.pre属性并将其值设置为true
        el.pre = true
    }
}

// 接收元素描述对象为参数 目的将该元素所有属性全部作为原生的属性attr进行处理
function processRawAttrs(el) {
    const list = el.attrsList
    const len = list.length
    if (len) {
        const attrs: Array < ASTAttr > = el.attrs = new Array(len)
        for (let i = 0; i < len; i++) {
            attrs[i] = {
                name: list[i].name,
                value: JSON.stringify(list[i].value)
                // 这里使用JSON.stringify的原因
                // const fn1 = new Function('console.log(1)')
                // const fn2 = new Function(JSON.stringify('console.log(1)'))
                // 上面代码中定义了两个函数 fn1 和 fn2，它们的区别在于 fn2 的参数使用了 JSON.stringify，实际上上面的代码等价于：
                // const fn1 = function () {
                //   console.log(1)
                // }
                // const fn2 = function () {
                //   'console.log(1)'
                // }
                // 目的是使 list[i].value始终当做普通字符串进行处理
            }
            // 如果一个标签解析处于v-pre环境中时,则会将该标签的属性全部添加到元素描述对象的attrs数组中
            // 且数组和attrslist几乎一样 不同点在于attrs中的value值是用JSON.stringify处理过的


            if (list[i].start != null) {
                attrs[i].start = list[i].start
                attrs[i].end = list[i].end
            }
        }
    } else if (!el.pre) {
        //当前元素描述对象没有属性 且没有使用v-pre指令 另外我们知道当前函数processRawAttrs
        // 的运行时处于v-pre环境中的 所以此处为 一个使用了v-pre指令标签的字标签
        // <div v-pre>
        // <span></span>
        // </div>
        // non root node in pre blocks with no attributes
        // 此时在当前元素对象上添加一个plan属性其值为true标明 该元素是纯的
        el.plain = true
    }
}

export function processElement(
    element: ASTElement,
    options: CompilerOptions
) {
    processKey(element)

    // determine whether this is a plain element after
    // removing structural attributes
    // 当结构化的属性被移除之后 检查该元素是否是纯的
    // 结构化指令 包括v-for v-if v-else-if v-else v-once
    // 这些指令被processFor processIf processOnce 处理过后会从元素的描述对象的attrsList数组中删除
    // 当前元素描述对象没有使用key属性 也没有使用scopedSlots 且attrList中是空的(即标签中只使用了结构化指令)

    element.plain = (
        !element.key &&
        !element.scopedSlots &&
        !element.attrsList.length
    ) //此时 会把元素描述对象的plain设置为true  静态优化和代码生成时会用到这个属性

    // 处理ref属性对应的属性值
    processRef(element)
    //处理插槽
    processSlotContent(element)
    processSlotOutlet(element)
    // 处理component内置组件
    processComponent(element)
    //中置处理
    for (let i = 0; i < transforms.length; i++) {
        element = transforms[i](element, options) || element
    }

    // v-pre
    // v-for
    // v-if、v-else-if、v-else
    // v-once
    // key
    // ref
    // slot、slot-scope、scope、name
    // is、inline-template 以上元素在processAttrs函数解析过了
    // 处理剩余未被处理的元素
    processAttrs(element)
    return element
}

function processKey(el) {
    // 通过getBindingAttr函数从元素描述对象的attrsList数组中获取 属性名为key的属性值
    // getBindingAttr 获取绑定属性的值 绑定属性就是通过v-bind 或者:缩写所定义的属性
    const exp = getBindingAttr(el, 'key')
    if (exp) {
        if (process.env.NODE_ENV !== 'production') {
            // 非生产环境下  如果当前标签为template 提示template模板不能使用key属性
            if (el.tag === 'template') {
                warn(
                    `<template> cannot be keyed. Place the key on real elements instead.`,
                    getRawBindingAttr(el, 'key')
                )
            }
            if (el.for) {
                const iterator = el.iterator2 || el.iterator1
                const parent = el.parent
                if (iterator && iterator === exp && parent && parent.tag === 'transition-group') {
                    // 如果key的属性值为 v-for的索引值 且父标签为transition-group 提示 transition-group的子标签上不能使用 v-for的索引值
                    //当作属性key的值,否则它会认为和没有添加过属性key是一样的
                    warn(
                        `Do not use v-for index as key on <transition-group> children, ` +
                        `this is the same as not using keys.`,
                        getRawBindingAttr(el, 'key'),
                        true /* tip */
                    )
                }
            }
        }
        // 为元素描述对象添加key属性其值为 属性名key对应的属性值
        el.key = exp
    }
}

// 接收元素描述对象作为参数
function processRef(el) {
    //通过getBindingAttr函数获取元素描述对象的ref属性 并把解析到的值赋给 ref
    const ref = getBindingAttr(el, 'ref')
    // 如果ref属性解析正确
    if (ref) {
        // 在当前元素描述对象上添加ref的属性 其值为 ref属性对应的属性值
        el.ref = ref
        // refInfor属性标识着这个使用了ref属性的标签是否存在于v-for的指令内
        // 以下这两种情况都属于ref属性的标签存在于v-for的指令内
        {
            /*一, <div v-for="obj of list" :ref="obj.id"></div>
            二,<div v-for="obj of list">
              <div :ref="obj.id"></div>
            </div> */

        }
        // 如果是refInfor的值为true 否则为false
        el.refInFor = checkInFor(el)
        // 为什么要判断ref属性是否在v-for指令中？如果ref属性存在v-for指令中,我们需要创建一个组件实例或者DOM节点的引用数组,而不是单一引用
        // 这个时候需要使用refInFor属性来判断
    }
}

// processFor接受元素描述对象作为参数
export function processFor(el: ASTElement) {
    let exp
    // 通过getAndRemoveAttr函数获取 v-for属性的值 并赋值给exp变量 如果没有v-for属性对应的属性值 将什么都不做
    if ((exp = getAndRemoveAttr(el, 'v-for'))) {
        // 利用parseFor函数解析v-for对应的属性值
        const res = parseFor(exp)
        // res的可能结果为
        //     1、如果 v-for 指令的值为字符串 'obj in list'，则 parseFor 函数的返回值为：
        // {
        //   for: 'list',
        //   alias: 'obj'
        // }
        // 2、如果 v-for 指令的值为字符串 '(obj, index) in list'，则 parseFor 函数的返回值为：
        // {
        //   for: 'list',
        //   alias: 'obj',
        //   iterator1: 'index'
        // }
        // 2、如果 v-for 指令的值为字符串 '(obj, key, index) in list'，则 parseFor 函数的返回值为：
        // {
        //   for: 'list',
        //   alias: 'obj',
        //   iterator1: 'key',
        //   iterator2: 'index'
        // }
        // 如果res存在
        if (res) {
            // 利用extend把res对象的属性混合到el当前元素的描述对象中去
            extend(el, res)
        } else if (process.env.NODE_ENV !== 'production') {
            // 如果parseFor解析失败 res为undefined 说明v-for指令的属性值无效 在非生产环境下对开发者进行提示警告
            warn(
                `Invalid v-for expression: ${exp}`,
                el.rawAttrsMap['v-for']
            )
        }
    }
}

type ForParseResult = {
    for: string;
    alias: string;
    iterator1 ? : string;
    iterator2 ? : string;
};

// 解析v-for对应的属性值
export function parseFor(exp: string): ? ForParseResult {
    // 利用正则去匹配v-for对应的属性值
    // 例如:<div v-for="obj in list"></div> 匹配成功后是
    // const inMatch = [
    //   'obj in list',
    //   'obj',
    //   'list'
    // ]
    const inMatch = exp.match(forAliasRE);
    // 如果匹配失败inMatch的值为null 直接返回 此时 paserFor的值为undefined
    if (!inMatch) return
    const res = {}
    // res.for属性储存的是被遍历的目标变量的名字 即上述 inMath中的list
    res.for = inMatch[2].trim()
    //  inMatch[1] 为v-for属性对应的属性值 in或则of前的字符串 如 '(obj, index) in list'中的 '(obj, index)'
    //利用trim()去掉前后空格 利用stripParensRE去掉 前后的( )
    const alias = inMatch[1].trim().replace(stripParensRE, '')
    //   如下是 v-for 指令的值与 alias 常量值的对应关系：
    // 1、如果 v-for 指令的值为 'obj in list'，则 alias 的值为字符串 'obj'
    // 2、如果 v-for 指令的值为 '(obj, index) in list'，则 alias 的值为字符串 'obj, index'
    // 3、如果 v-for 指令的值为 '(obj, key, index) in list'，则 alias 的值为字符串 'obj, key, index'
    // 利用forIteratorRE匹配去掉括号后的 in或of前的字符串
    const iteratorMatch = alias.match(forIteratorRE)
    //iteratorMatch的匹配结果有以下几种情况
    // 1、如果 alias 字符串的值为 'obj'，则匹配结果 iteratorMatch 常量的值为 null
    // 2、如果 alias 字符串的值为 'obj, index'，则匹配结果 iteratorMatch 常量的值是一个包含两个元素的数组：[', index', 'index']
    // 3、如果 alias 字符串的值为 'obj, key, index'，则匹配结果 iteratorMatch 常量的值是一个包含三个元素的数组：[', key, index', 'key'， 'index']

    if (iteratorMatch) { // 如果匹配成功
        // res.alias的值 为 'obj, index'去掉, index后的 obj;
        res.alias = alias.replace(forIteratorRE, '').trim()
        // res.iterator1的值为 'obj, index'的index 即forIteratorRE的第一个捕获组
        res.iterator1 = iteratorMatch[1].trim()
        // res.iterator2的值为'obj, key, index'中的 index 即forIteratorRE的第二个捕获组
        if (iteratorMatch[2]) {
            res.iterator2 = iteratorMatch[2].trim()
        }
    } else { // 如果匹配失败
        //res.alias属性的值 就是alias常量
        res.alias = alias
    }
    return res
}

function processIf(el) {
    // 从该元素描述对象的attrsList属性中删除v-if属性,并获取v-if的属性值
    const exp = getAndRemoveAttr(el, 'v-if')
    //如果没有写v-if的属性值 exp将为"",所以不会走下面的判断语句 即如果不写v-if属性值 就相当于没有写v-if指令
    if (exp) {
        // 定义元素描述对象的if属性 其值为v-if的属性值
        el.if = exp
        // 并把自身作为条件对象 添加到自身的元素描述对象的ifConditions数组中
        //条件对象是形如这样数据结构的对象 {
        //   exp: exp,
        //   block: el
        // }
        addIfCondition(el, {
            exp: exp,
            block: el
        })
    } else {
        // 因为v-else不需要属性值 所以与null进行比较 如果使用了v-else
        if (getAndRemoveAttr(el, 'v-else') != null) {
            // 给当前元素描述对象添加else属性 其值为true
            el.else = true
        }
        // 获取v-else-if指令的属性值
        const elseif = getAndRemoveAttr(el, 'v-else-if')
        if (elseif) {
            // 如果当前元素描述对象使用了v-else-if属性,则为当前元素描述对象添加elseif属性 其值为v-else-if的属性值
            el.elseif = elseif
        }
    }
}

function processIfConditions(el, parent) {
    // 找到当前元素的前一个元素描述对象 并将值赋给prev
    const prev = findPrevElement(parent.children)
    // 如果prev存在 且pre上有v-if指令
    if (prev && prev.if) {
        // 把当前元素描述对象添加到前一个元素的ifConditions
        addIfCondition(prev, {
            exp: el.elseif,
            block: el
        })
        // 如果前一个元素没有v-if指令
    } else if (process.env.NODE_ENV !== 'production') {
        //打印错误警告信息 提示开发者没有相符的使用了v-if指令的元素
        warn(
            `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
            `used on element <${el.tag}> without corresponding v-if.`,
            el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
        )
    }
}

// 寻找当前元素的前一个元素节点
// 用在 当解析器遇到一个带有v-else-if 或者v-else指令的元素时,找到该元素的前一个元素节点
function findPrevElement(children: Array < any > ) : ASTElement | void {
    let i = children.length
    // 因为当前正在解析的标签(使用了v-else-if)还没有添加到父级元素描述对象的children数组中
    // 因此父级元素描述对象的children数组中的最后一个元素节点就是我们要找的当前正在解析标签的前一个元素节点
    // 因为v-else-if会添加到v-if指令元素的ifConditions中 所以v-else指令元素的前一个元素节点仍是 v-else-if找到的前一个元素节点
    while (i--) {
        // 从后向前遍历 直到遇到一个元素节点就立即返回该元素节点
        if (children[i].type === 1) { //type==1为元素节点
            return children[i]
        } else { // 如果找到节点之前遇到的为非元素节点
            // 在非生产环境下且该子节点的文本属性不为空 打印警告信息 并忽略v-if v-else-if v-else指令之间的内容
            if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
                warn(
                    `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
                    `will be ignored.`,
                    children[i]
                )
            }
            // 把非元素节点从当前父元素节点的子节点中剔除出去
            children.pop()
        }
    }
}

// 接收两个参数 第一个元素描述对象
// 第二个参数也是一个对象 type ASTIfCondition = { exp: ?string; block: ASTElement };
export function addIfCondition(el: ASTElement, condition: ASTIfCondition) {
    if (!el.ifConditions) {
        el.ifConditions = []
    }
    // 具有v-else-if和v-else属性的元素描述对象会被添加到 具有v-if属性的元素描述对象的ifConditions属性中
    // 除此之外 v-if属性的元素描述对象也会被添加到自身的ifConditions属性中去
    el.ifConditions.push(condition)
}

function processOnce(el) {
    // 首先通过getAndRemoveAttr获取并移除元素描述对象的attrsList数组中名字为v-once的属性值
    // 并将获取到的属性值赋给once常量
    const once = getAndRemoveAttr(el, 'v-once')
    // 如果v-once对应的属性值不为null 则给当前元素描述对象添加once属性 为true
    if (once != null) {
        el.once = true
    }
}

// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
function processSlotContent(el) {
    let slotScope
    // 如果当前标签是template
    if (el.tag === 'template') {
        // 获取template标签上的scope的属性值 并把它赋值给slotScope
        slotScope = getAndRemoveAttr(el, 'scope')
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && slotScope) {
            // 在非生产环境下，如果 slotScope 变量存在，则说明 <template> 标签中使用了 scope 属性，
            // 但是这个属性已经在 2.5.0+ 的版本中被 slot-scope 属性替代了，所以现在更推荐使用 slot-scope 属性，
            // 好处是 slot-scope 属性不受限于 <template> 标签。
            warn(
                `the "scope" attribute for scoped slots have been deprecated and ` +
                `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
                `can also be used on plain elements in addition to <template> to ` +
                `denote scoped slots.`,
                el.rawAttrsMap['scope'],
                true
            )
        }
        // 如果存在scope则获取scope对应的属性值 否则尝试 获取template标签上的slot-scope属性对应的属性值 并把值赋给slotScope
        el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
        // 以上无论是scope还是slot-scope都是通过 getAndRemoveAttr属性获取的 所以说明scope和slot-scope属性都不能用作绑定属性
    } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) { // slot-scope属性可以用在任何标签上 如果不是template 直接去获取当前元素描述对象上的slot-scope的属性值
        // 如果获取到直接赋值给slotScope并执行以下代码 如果获取不执行以下代码
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
            //  <div slot-scope="slotProps" v-for="item of slotProps.list"></div>
            //   如上这句代码中，slot-scope 属性与 v-for 指令共存，这会造成什么影响呢
            // v-for具有更高的优先级 因此v-for绑定的状态将会是父组件作用域绑定的状态,
            // 而不是子组件通过作用域插槽传递的状态  并且这样使用很容易让人感到困惑
            warn(
                `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
                `(v-for takes higher priority). Use a wrapper <template> for the ` +
                `scoped slot to make it clearer.`,
                el.rawAttrsMap['slot-scope'],
                true
            )
            //  <template slot-scope="slotProps">
            //    <div v-for="item of slotProps.list"></div>
            // </template>
            // 这样就不会有任何歧义，v-for 指令绑定的状态就是作用域插槽传递的状态
        }

        el.slotScope = slotScope
        // 我们发现无论是 <template> 标签，还是其他元素标签，只要该标签使用了 slot-scope 属性，
        // 则该标签的元素描述对象将被添加 el.slotScope 属性。
    }

    //处理标签的slot属性 使用getBindingAttr说明该属性是可以使用绑定属性 并把值赋给slotTarget属性
    // slot="xxx"
    const slotTarget = getBindingAttr(el, 'slot')

    if (slotTarget) {
        // 这句代码检测了 slotTarget 变量是否为字符串 '""'，
        // 这种情况出现在标签虽然使用了 slot 属性，但却没有为 slot 属性指定相应的值，如下：<div slot></div>
        // 否则直接把slotTarget的值赋给当前元素描述对象的属性slotTarget
        el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
        //用slotTargetDynamic属性来记录当前元素对象是否有:slot或则v-bind:slot对应的属性值
        el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot'])
        // preserve slot as an attribute for native shadow DOM compat
        // only for non-scoped slots.
        if (el.tag !== 'template' && !el.slotScope) {
            // 注释已经写的很清楚了，实际上这段代码的作用就是用来保存原生影子DOM(shadow DOM)的 slot 属性
            // 当然啦既然是原生影子DOM的 slot 属性，那么首先该元素必然应该是原生DOM，所以 el.tag !== 'template' 必须成立，
            // 同时对于作用域插槽是不会保留原生 slot 属性的。

            addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'))
        }
    }

    // 2.6 v-slot syntax
    if (process.env.NEW_SLOT_SYNTAX) {
        if (el.tag === 'template') {
            // v-slot on <template>
            const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
            if (slotBinding) {
                if (process.env.NODE_ENV !== 'production') {
                    if (el.slotTarget || el.slotScope) {
                        warn(
                            `Unexpected mixed usage of different slot syntaxes.`,
                            el
                        )
                    }
                    if (el.parent && !maybeComponent(el.parent)) {
                        warn(
                            `<template v-slot> can only appear at the root level inside ` +
                            `the receiving component`,
                            el
                        )
                    }
                }
                const { name, dynamic } = getSlotName(slotBinding)
                el.slotTarget = name
                el.slotTargetDynamic = dynamic
                el.slotScope = slotBinding.value || emptySlotScopeToken // force it into a scoped slot for perf
            }
        } else {
            // v-slot on component, denotes default slot
            const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
            if (slotBinding) {
                if (process.env.NODE_ENV !== 'production') {
                    if (!maybeComponent(el)) {
                        warn(
                            `v-slot can only be used on components or <template>.`,
                            slotBinding
                        )
                    }
                    if (el.slotScope || el.slotTarget) {
                        warn(
                            `Unexpected mixed usage of different slot syntaxes.`,
                            el
                        )
                    }
                    if (el.scopedSlots) {
                        warn(
                            `To avoid scope ambiguity, the default slot should also use ` +
                            `<template> syntax when there are other named slots.`,
                            slotBinding
                        )
                    }
                }
                // add the component's children to its default slot
                const slots = el.scopedSlots || (el.scopedSlots = {})
                const { name, dynamic } = getSlotName(slotBinding)
                const slotContainer = slots[name] = createASTElement('template', [], el)
                slotContainer.slotTarget = name
                slotContainer.slotTargetDynamic = dynamic
                slotContainer.children = el.children.filter((c: any) => {
                    if (!c.slotScope) {
                        c.parent = slotContainer
                        return true
                    }
                })
                slotContainer.slotScope = slotBinding.value || emptySlotScopeToken
                // remove children as they are returned from scopedSlots now
                el.children = []
                // mark el non-plain so data gets generated
                el.plain = false
            }
        }
    }
}

function getSlotName(binding) {
    let name = binding.name.replace(slotRE, '')
    if (!name) {
        if (binding.name[0] !== '#') {
            name = 'default'
        } else if (process.env.NODE_ENV !== 'production') {
            warn(
                `v-slot shorthand syntax requires a slot name.`,
                binding
            )
        }
    }
    return dynamicArgRE.test(name)
        // dynamic [name]
        ?
        { name: name.slice(1, -1), dynamic: true }
        // static name
        :
        { name: `"${name}"`, dynamic: false }
}

// handle <slot/> outlets
function processSlotOutlet(el) {
    // 如果当前标签是slot
    if (el.tag === 'slot') {
        // 获取slot标签上的name属性值 <slot name="header"></slot>
        // 则 el.slotName 属性的值为 JSON.stringify('header')。
        // 如果<slot></slot>则 el.slotName 属性的值为 undefined。
        el.slotName = getBindingAttr(el, 'name')
        if (process.env.NODE_ENV !== 'production' && el.key) {
            // 在非生产环境下，如果发现在 <slot> 标签中使用 key 属性，则会打印警告信息，提示开发者 key 属性不能使用在 slot 标签上，另外大家应该还记得，
            // 在前面的分析中我们也知道 key 属性同样不能使用在 <template> 标签上。大家可以发现 <slot> 标签和 <template>
            // 标签的共同点就是他们都是抽象组件，抽象组件的特点是要么不渲染真实DOM，要么会被不可预知的DOM元素替代。
            // 这就是在这些标签上不能使用 key 属性的原因。对于 <slot> 标签的处理就是如上这些内容
            warn(
                `\`key\` does not work on <slot> because slots are abstract outlets ` +
                `and can possibly expand into multiple elements. ` +
                `Use the key on a wrapping element instead.`,
                getRawBindingAttr(el, 'key')
            )
        }
    }
}

// 处理component内置组件
function processComponent(el) {
    let binding
    // 处理component组件上的is属性 支持绑定值
    if ((binding = getBindingAttr(el, 'is'))) {
        // 将取到的值赋值给当前元素描述对象的component
        el.component = binding
        // 例子一：
        // <div is></div>
        // 上例中的 is 属性是非绑定的，并且没有任何值，则最终如上标签经过处理后其元素描述对象的 el.component 属性值为空字符串：
        // el.component = ''
        // 例子二：
        // <div is="child"></div>
        // 上例中的 is 属性是非绑定的，但是有一个字符串值，则最终如上标签经过处理后其元素描述对象的 el.component 属性值为：
        // el.component = JSON.stringify('child')
        // 例子三：
        // <div :is="child"></div>
        // 上例中的 is 属性是绑定的，并且有一个字符串值，则最终如上标签经过处理后其元素描述对象的 el.component 属性值为：
        // el.component = 'child'
    }
    // 处理component组件上的inline-template属性值 inline-template不是绑定属性
    if (getAndRemoveAttr(el, 'inline-template') != null) {
        // 如果获取成功把当前元素描述对象上的inlineTemplate属性设置为true 说明该标签使用了inlineTemplate属性
        el.inlineTemplate = true
    }
}

// 处理剩余元素
function processAttrs(el) {

    // 定义一个list  它是el.attrsList得数组引用
    const list = el.attrsList
    let i, l, name, rawName, value, modifiers, syncGen, isDynamic

    // 循环的目的就是遍历el.attrsList数组 也就是说逐步处理el.attrsList剩余属性的值
    for (i = 0, l = list.length; i < l; i++) {
        name = rawName = list[i].name // 属性的名字
        value = list[i].value //属性对应的值

        // 检测标签属性名是否是指令
        // v-开头的属性都被认为是指令 @是v-on的缩写 :是v-bind的缩写
        // #是v-slot的缩写
        // export const dirRE = process.env.VBIND_PROP_SHORTHAND ?
        // /^v-|^@|^:|^\.|^#/ :
        // /^v-|^@|^:|^#/
        // 如果属性的名字以 v- @ : # .开头则走if条件分支 否则走else分支

        if (dirRE.test(name)) {
            // mark element as dynamic
            // 一个完整的指令包含 指令的名称 指令的参数 指令的值 指令的修饰符
            // 既然元素使用了指令 指令的值就是表达式  既然是指令的值是表达式 那就说明涉及动态内容
            // 所以此时会在元素描述对象上添加 el.hasBindings 属性，并将其值设置为 true
            // 标识着当前元素是一个动态的元素。
            el.hasBindings = true
            // modifiers
            modifiers = parseModifiers(name.replace(dirRE, ''))
            // support .foo shorthand syntax for the .prop modifier
            if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
                (modifiers || (modifiers = {})).prop = true
                name = `.` + name.slice(1).replace(modifierRE, '')
            } else if (modifiers) {
                name = name.replace(modifierRE, '')
            }
            if (bindRE.test(name)) { // v-bind
                name = name.replace(bindRE, '')
                value = parseFilters(value)
                isDynamic = dynamicArgRE.test(name)
                if (isDynamic) {
                    name = name.slice(1, -1)
                }
                if (
                    process.env.NODE_ENV !== 'production' &&
                    value.trim().length === 0
                ) {
                    warn(
                        `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
                    )
                }
                // 如果由修饰符 v-bind: 为开发者提供了三个修饰符 prop camel sync
                if (modifiers) {
                    // 如果使用了prop 该对象将被作为原生DOM对象属性
                    if (modifiers.prop && !isDynamic) {
                        //驼峰化属性名
                        name = camelize(name)
                        if (name === 'innerHtml') name = 'innerHTML'
                    }
                    if (modifiers.camel && !isDynamic) {
                        name = camelize(name)
                    }
                    if (modifiers.sync) {
                        syncGen = genAssignmentCode(value, `$event`)
                        if (!isDynamic) {
                            addHandler(
                                el,
                                `update:${camelize(name)}`,
                                syncGen,
                                null,
                                false,
                                warn,
                                list[i]
                            )
                            if (hyphenate(name) !== camelize(name)) {
                                addHandler(
                                    el,
                                    `update:${hyphenate(name)}`,
                                    syncGen,
                                    null,
                                    false,
                                    warn,
                                    list[i]
                                )
                            }
                        } else {
                            // handler w/ dynamic event name
                            addHandler(
                                el,
                                `"update:"+(${name})`,
                                syncGen,
                                null,
                                false,
                                warn,
                                list[i],
                                true // dynamic
                            )
                        }
                    }
                }
                if ((modifiers && modifiers.prop) || (
                        !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
                    )) {
                    addProp(el, name, value, list[i], isDynamic)
                } else {
                    addAttr(el, name, value, list[i], isDynamic)
                }
            } else if (onRE.test(name)) { // v-on
                name = name.replace(onRE, '')
                isDynamic = dynamicArgRE.test(name)
                if (isDynamic) {
                    name = name.slice(1, -1)
                }
                addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic)
            } else { // normal directives
                name = name.replace(dirRE, '')
                // parse arg
                const argMatch = name.match(argRE)
                let arg = argMatch && argMatch[1]
                isDynamic = false
                if (arg) {
                    name = name.slice(0, -(arg.length + 1))
                    if (dynamicArgRE.test(arg)) {
                        arg = arg.slice(1, -1)
                        isDynamic = true
                    }
                }
                addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i])
                if (process.env.NODE_ENV !== 'production' && name === 'model') {
                    checkForAliasModel(el, value)
                }
            }
        } else {
            // literal attribute
            if (process.env.NODE_ENV !== 'production') {
                const res = parseText(value, delimiters)
                if (res) {
                    warn(
                        `${name}="${value}": ` +
                        'Interpolation inside attributes has been removed. ' +
                        'Use v-bind or the colon shorthand instead. For example, ' +
                        'instead of <div id="{{ val }}">, use <div :id="val">.',
                        list[i]
                    )
                }
            }
            addAttr(el, name, JSON.stringify(value), list[i])
            // #6887 firefox doesn't update muted state if set via attribute
            // even immediately after element creation
            if (!el.component &&
                name === 'muted' &&
                platformMustUseProp(el.tag, el.attrsMap.type, name)) {
                addProp(el, name, 'true', list[i])
            }
        }
    }
}

function checkInFor(el: ASTElement): boolean {
    // 如果一个标签使用了ref属性 那么如果该标签或者该标签的父级元素上存在v-for指令 那么就认为ref属性是在v-for指令之内的
    // 因此如果要判断ref属性是否在v-for指令之内,就要从当前元素描述对象开始一直遍历到根节点元素的描述对象 一旦发现某个标签上存在v-for属性
    // 就认为该ref属性在v-for指令之内
    let parent = el
    while (parent) {
        // 判断当前元素存在v-for属性
        if (parent.for !== undefined) {
            return true
        }
        //如果不存在 向根元素的方向继续寻找
        parent = parent.parent
    }
    return false
}

function parseModifiers(name: string): Object | void {
    const match = name.match(modifierRE)
    if (match) {
        const ret = {}
        match.forEach(m => { ret[m.slice(1)] = true })
        return ret
    }
}

function makeAttrsMap(attrs: Array < Object > ): Object {
    const map = {}
    for (let i = 0, l = attrs.length; i < l; i++) {
        if (
            process.env.NODE_ENV !== 'production' &&
            map[attrs[i].name] && !isIE && !isEdge
        ) {
            warn('duplicate attribute: ' + attrs[i].name, attrs[i])
        }
        map[attrs[i].name] = attrs[i].value
    }
    return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag(el): boolean {
    return el.tag === 'script' || el.tag === 'style'
}

// isForbiddenTag接收一个元素描述对象作为参数
function isForbiddenTag(el): boolean {
    // style是禁止标签
    // script标签如果没有type属性 是禁止标签
    // script标签 type属性为 text/javascript
    return (
        el.tag === 'style' ||
        (el.tag === 'script' && (
            !el.attrsMap.type ||
            el.attrsMap.type === 'text/javascript'
        ))
    )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
function guardIESVGBug(attrs) {
    // <svg xmlns:feature="http://www.openplans.org/topp"></svg>在IE下被渲染为:
    // <svg xmlns:NS1="" NS1:xmlns:feature="http://www.openplans.org/topp"></svg>
    // 以上标签传递给start钩子函数时 attrs为
    // attrs = [
    //   {
    //     name: 'xmlns:NS1',
    //     value: ''
    //   },
    //   {
    //     name: 'NS1:xmlns:feature',
    //     value: 'http://www.openplans.org/topp'
    //   }
    // ]
    const res = []
    for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i]
        if (!ieNSBug.test(attr.name)) { // 剔除 name:xmlns:NS1
            attr.name = attr.name.replace(ieNSPrefix, '')
            // 把 'NS1:xmlns:feature'转化为 xmlns:feature
            res.push(attr)
        }
    }
    //最终 attrs = [
    //   {
    //     name: 'xmlns:feature',
    //     value: 'http://www.openplans.org/topp'
    //   }
    // ]
    return res
}

function checkForAliasModel(el, value) {
    let _el = el
    while (_el) {
        if (_el.for && _el.alias === value) {
            warn(
                `<${el.tag} v-model="${value}">: ` +
                `You are binding v-model directly to a v-for iteration alias. ` +
                `This will not be able to modify the v-for source array because ` +
                `writing to the alias is like modifying a function local variable. ` +
                `Consider using an array of objects and use v-model on an object property instead.`,
                el.rawAttrsMap['v-model']
            )
        }
        _el = _el.parent
    }
}
