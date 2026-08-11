import socket

# Configuração do cliente
client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
client_socket.connect(('localhost', 12345))

# Enviando dados para o servidor
client_socket.sendall("Olá, servidor!".encode())

# Recebendo resposta do servidor
data = client_socket.recv(1024)
print(f"Resposta do servidor: {data.decode()}")

client_socket.close()
