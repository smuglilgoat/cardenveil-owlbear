<script>
  import OBR from "@owlbear-rodeo/sdk";

  let count = $state(0)
  const increment = () => {
    count += 1
    OBR.notification.show(`count is ${count}`);
  }
</script>

<button onclick={increment}>
  count is {count}
</button>
