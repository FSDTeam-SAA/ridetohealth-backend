const  initializeSocket = require( './socket.js');


   const io = initializeSocket(httpServer);
    app.set('io', io);
