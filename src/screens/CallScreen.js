import { useParams } from "react-router-dom";
import { useRef, useEffect } from "react";
import socketio from "socket.io-client";
import "./CallScreen.css";

function CallScreen() {
  const params = useParams();
  const localUsername = params.username;
  const roomName = params.room;
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const socket = socketio("http://localhost:9000", {
    autoConnect: false,
  });// auto connect false because we only want to connect to video when ready

  let pc; // For RTCPeerConnection Object

  const sendData = (data) => {
    socket.emit("data", {
      username: localUsername,
      room: roomName,
      data: data,
    });
  };
    //start Connection initiates the connection, getUserMedia is importtant to set the settings of it
  const startConnection = () => {
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          height: 350,
          width: 350,
        },
      })
      .then((stream) => {
        console.log("Local Stream found");
        localVideoRef.current.srcObject = stream; //we set the local video elements reference to the srcObject
        socket.connect();
        socket.emit("join", { username: localUsername, room: roomName }); //then join room with username 
      })
      .catch((error) => {
        console.error("Stream not found: ", error);
      });
  };
    //below we create an Icecandidate which is the protocol and routing we need for webRTC to communicate with remote devices 
  const onIceCandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate");
      sendData({
        type: "candidate",
        candidate: event.candidate,
      });
    }
  };

  const onTrack = (event) => {
    console.log("Adding remote track");
    remoteVideoRef.current.srcObject = event.streams[0];
  };
    //Below is used to create a peer connection 
  const createPeerConnection = () => {
    try {
      pc = new RTCPeerConnection({
        iceServers: [
          {
            urls: "stun:openrelay.metered.ca:80",
          },
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
      });
      pc.onicecandidate = onIceCandidate;
      pc.ontrack = onTrack;
      const localStream = localVideoRef.current.srcObject;
      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      } //the above like assigns the peer connection to pc through .addTrack
      console.log("PeerConnection created");
    } catch (error) {
      console.error("PeerConnection failed: ", error);
    }
  };

  const setAndSendLocalDescription = (sessionDescription) => {
    pc.setLocalDescription(sessionDescription);
    console.log("Local description set");
    sendData(sessionDescription);
  };
//below creates an offer in the pc 
  const sendOffer = () => {
    console.log("Sending offer");
    pc.createOffer().then(setAndSendLocalDescription, (error) => {
      console.error("Send offer failed: ", error);
    });
  };
    //below sends an answer 
  const sendAnswer = () => {
    console.log("Sending answer");
    pc.createAnswer().then(setAndSendLocalDescription, (error) => {
      console.error("Send answer failed: ", error);
    });
  };
    //below handles all the events 
  const signalingDataHandler = (data) => {
    if (data.type === "offer") {
      createPeerConnection();
      pc.setRemoteDescription(new RTCSessionDescription(data));
      sendAnswer(); //if an event is offered, create a peer connection, set remote des and send an answer 
    } else if (data.type === "answer") {
      pc.setRemoteDescription(new RTCSessionDescription(data)); //if answered set the remote descrition 
    } else if (data.type === "candidate") {
      pc.addIceCandidate(new RTCIceCandidate(data.candidate)); //if there is an ICE candidate add it 
    } else {
      console.log("Unknown Data");
    }
  };

  socket.on("ready", () => {
    console.log("Ready to Connect!");
    createPeerConnection();
    sendOffer();
  }); //when ready is fired(a peer joined the same room), a pc is created and an offer is sent 


  socket.on("data", (data) => {
    console.log("Data received: ", data);
    signalingDataHandler(data);
  }); //used to handle the data from the server, this is fired every time a peer sends an offer/answer, or ICE candidate 

  useEffect(() => {
    startConnection();
    return function cleanup() {
      pc?.close();
    };
  }, []);//here we start the connection in a useEffect so it will start at the components lifecycle
    //cleanup closes the pc 


  return (
    <div>
      <label>{"Username: " + localUsername}</label>
      <label>{"Room Id: " + roomName}</label>
      <video autoPlay muted playsInline ref={localVideoRef} />
      <video autoPlay muted playsInline ref={remoteVideoRef} />
    </div>
  );
}

export default CallScreen;
