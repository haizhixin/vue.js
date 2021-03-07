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
        name1:"王五",
        name:"ee",
        t1:1,
        t2:2
      
    };
  },
//   computed: {
//     name() {
//       return this.t1+this.t2;
//     },
//   },
  beforCreate() {
      console.log("beforeCreate")

  },
  created() {
    //   this.name = 2
   console.log("created")
//    this.t1 = Date.now()
//     Promise.resolve().then(()=>{
//        console.log("数据改变")
//        this.name = 2
//    })

  },
  beforeMount() {
   console.log("beforeMount")
   
  },
  mounted() {
    //   this.t2 = Date.now()

    //   console.log((this.t2-this.t1)/1000)
   console.log("mounted")

//    setTimeout(()=>{
//        this.name1="3333"
//      this.t1 =1;
//      this.t2 =2;
//    },5000)
Promise.resolve().then(()=>{
       console.log("数据改变")
       this.name = 2
   })
   

   
   
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

