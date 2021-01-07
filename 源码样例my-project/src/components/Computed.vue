<template>
  <div id="app">
    {{ name }} - {{ info.age }}
    <button @click="change">change useless</button>
    <button @click="changeLast">change last name</button>
  </div>
</template>

  <script>
export default {
  data() {
    return {
      firstName: " Qian ",
      lastName: " Yu ",
      info: {
        age: 25,
      },
      useless: 1,
    };
  },
  methods: {
    change() {
      this.useless++;
      this.useless++;
      this.useless++;
    },

    changeLast() {
      this.lastName = " Zhang ";
    },
  },
  watch: {
    useless(newValue, oldValue) {
      console.log(this.useless);
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

