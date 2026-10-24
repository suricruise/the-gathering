const retry = document.getElementById("retry");
const connection = document.getElementById("connection");
retry?.addEventListener("click", () => window.location.reload());
window.addEventListener("online", () => { if(connection) connection.textContent="A network is available. Select Try again to reconnect."; });
window.addEventListener("offline", () => { if(connection) connection.textContent="Still offline. Check Wi-Fi or mobile data, then try again."; });
