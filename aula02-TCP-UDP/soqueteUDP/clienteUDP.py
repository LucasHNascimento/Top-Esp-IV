import socket

# Configuração do cliente
client_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# Enviando dados para o servidor
client_socket.sendto("Olá, servidor!".encode(), ('localhost', 12345))

# Recebendo resposta do servidor
data, server = client_socket.recvfrom(1024)
print(f"Resposta do servidor: {data.decode()}")

client_socket.close()
