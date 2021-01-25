// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue'
import App from './App'
import router from './router'

Vue.config.productionTip = false

/* eslint-disable no-new */
new Vue({
  el: "#app",//确定挂载点 被render 和 template最终生成的dom元素替换
  router,
  components: { App },
  template: '<App/>'
//   render:h=>h('h1', '一则头条')
})
