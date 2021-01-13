<template>
  <div id="app">
    <div>{{compA}}</div>
  </div>
</template>

  <script>
export default {
  data() {
    return {
      a: 1
    };
  },
  computed:{
      compA () {
       return this.a + 1
    }
  }
  
};
</script>

