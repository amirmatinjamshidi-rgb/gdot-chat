import * as signalR from "@microsoft/signalr";

async function main() {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl("http://localhost:5067/chatHub")
    .withAutomaticReconnect()
    .build();

  connection.on("ReceiveMessage", (from, message) => {
    console.log("From:", from, "Message:", message);
  });

  await connection.start();
  console.log("connected");

  await connection.invoke("SendMessage");
}

main().catch(console.error);