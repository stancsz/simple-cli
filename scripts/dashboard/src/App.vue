<template>
  <div id="app-container">
    <nav>
      <router-link to="/">Dashboard</router-link>
    </nav>
    <main>
      <router-view />
    </main>
  </div>
</template>

<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  margin: 0;
  padding: 0;
  background-color: #f4f6f8;
  color: #333;
}

#app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

nav {
  background-color: #fff;
  padding: 1rem 2rem;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

nav a {
  font-weight: bold;
  color: #2c3e50;
  text-decoration: none;
  font-size: 1.2rem;
}

nav a.router-link-exact-active {
  color: #42b983;
}

main {
  flex: 1;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
</style>
