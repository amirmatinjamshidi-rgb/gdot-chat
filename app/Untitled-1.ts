const signalR = require("@microsoft/signalr");

async function main() {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl("http://localhost:5067/chatHub")
    .withAutomaticReconnect()
    .build();

  connection.on("ReceiveMessage", (from: string, message: string) => {
    console.log("From:", from, "Message:", message);
  });

  await connection.start();
  console.log("connected");

  await connection.invoke("SendMessage", "user2", "hello from CLI");
}

main().catch(console.error);