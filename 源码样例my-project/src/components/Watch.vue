<template>
  <div>
    <div>{{ name }} - {{ age }}</div>
    <button @click="change">change useless</button>
    <button @click="changeLast">change last name</button>
  </div>
</template>

<script type='text/javascript'>
export default {
  data() {
    return {
      text: {
        firstName: " Qian ",
        lastName: " Yu ",
        age: 25,
        useless: 1,
      },
    };
  },
  methods: {
    change() {
      this.useless++;
    },

    changeLast() {
      this.lastName = " Zhang ";
    },
  },
  computed: {
    name() {
      if (this.useless > 1) {
        return this.firstName + "," + this.lastName;
      }
      return "Please click change";
    },
  },
};
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
</style>
