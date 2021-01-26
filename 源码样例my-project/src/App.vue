<template>
  <div id="app">
    <div>{{ compA }}</div>
    <router-view />
  </div>
</template>

<script>
export default {
  name: "App",
  data() {
    return {
      a: 1,
    };
  },
  computed: {
    compA() {
      return this.a + 1;
    },
  },
};
</script>

