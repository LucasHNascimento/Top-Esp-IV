import socket
import threading

# Flag para controlar o loop principal do servidor
running = True

def manipula_cliente(connection, addr):
	print(f"conexão estabelecida com {addr}.")
	data = connection.recv(1024)
	print(f"Mensagem recebida: {data.decode()}")
	connection.sendall("Mensagem recebida".encode())
	connection.close()

server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server_socket.bind(('localhost', 12345))
server_socket.listen(5)

print("Servidor TCP aguardando conexões...")

try:
	while running:
		connection, addr = server_socket.accept()
		client_thread = threading.Thread(target=manipula_cliente, args=(connection, addr))
		client_thread.start()
except KeyboardInterrupt:
	print("\nServidor interrompido manualmente.")

# Finalizando o servidor
server_socket.close()
print("Servidor encerrado.")
