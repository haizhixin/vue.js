 <template >

<div id="app22">
   张三和李四s {{name}}
    <!-- <router-view/> -->
  </div>

  
</template>

<script>
export default {
  name: "App",
  data() {
    return {
        name:"王五",
        t1:"",
        t2:""
      
    };
  },
  beforCreate() {
      console.log("beforeCreate")

  },
  created() {
      this.name = 2
   console.log("created")
   this.t1 = Date.now()


  },
  beforeMount() {
   console.log("beforeMount")
   
  },
  mounted() {
      this.t2 = Date.now()

      console.log((this.t2-this.t1)/1000)
   console.log("mounted")
   
//     Promise.resolve().then(()=>{
//        console.log("数据改变")
//        this.name = 2
//    })
   
   
  },
  beforeUpdate() {
      console.log("beforeUpdate")

  },
  updated() {
   console.log("updated")
  },

  methods: {
    
  },
};
</script>

<style>
#app {
  font-family: "Avenir", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
