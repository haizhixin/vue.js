<template>
  <div id="app">
    <span id="name" ref="name">{{ name }}</span>
    <button @click="change">change name</button>
    <div id="content"></div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      name: " SHERlocked93 ",
    };
  },
  methods: {
    change: function () {
      const that = this;
      const $name = this.$refs.name;
      setTimeout(function () {
        console.log("setTimeout方式：  " + $name.innerHTML);
      });
      this.$nextTick(function () {
        console.log("setter前：" + $name.innerHTML);
      });
      this.name = " name改喽 ";
      this.console("同步方式：" + $name.innerHTML);
      this.$nextTick(function () {
        console.log("setter后：" + $name.innerHTML);
      });
      // this.$nextTick().then(function() {
      //     console.log('Promise方式：' + $name.innerHTML)
      //   }
      // )
    },

    console: function (cont) {
      const $content = document.querySelector("#content");
      const $div = document.createElement("div");
      $div.appendChild(document.createTextNode(cont));
      $content.appendChild($div);
    },
  },
};
</script>
