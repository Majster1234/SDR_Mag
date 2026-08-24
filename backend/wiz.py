import numpy as np
import matplotlib.pyplot as plt

# 1. GENEROWANIE DANYCH (Symulacja ruchu robota)
# Czas przejazdu (10 sekund, 500 próbek)
t = np.linspace(0, 10, 500)

# Idealny prąd referencyjny (symulacja ruchu ramienia w kilku kierunkach)
I_ref = np.sin(t) + 0.5 * np.sin(2.5 * t) + 0.2 * np.sin(5 * t)

# Prąd badany (Zimny robot - smar stawia większy opór, pobór prądu rośnie o ~30%)
# Dodajemy też odrobinę losowego szumu, żeby dane wyglądały realistycznie
I_test = I_ref * 1.30 + np.random.normal(0, 0.08, len(t))

# 2. OBLICZENIA MATEMATYCZNE Z TWOJEJ APLIKACJI
# Metoda Najmniejszych Kwadratów (wyliczenie optymalnego mnożnika k)
denom = np.sum(I_test**2)
k = np.sum(I_test * I_ref) / denom

# Skompensowany prąd testowy (Wirtualny rozgrzany robot)
I_comp = I_test * k

# 3. WIZUALIZACJA
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 10))

# Wykres 1: Dziedzina Czasu (Jak na oscyloskopie)
ax1.plot(t, I_ref, label='Referencja (Idealna)', color='#4caf50', linewidth=2)
ax1.plot(t, I_test, label='Badany (Zimny robot)', color='#ff9800', alpha=0.7)
ax1.plot(t, I_comp, label=f'Badany po kompensacji (k={k:.3f})', color='#2196f3', linestyle='--', linewidth=2)
ax1.set_title('Wykres Czasowy - Niwelowanie oporu lepkiego mnożnikiem k')
ax1.set_xlabel('Czas [s]')
ax1.set_ylabel('Prąd [A]')
ax1.legend()
ax1.grid(True, linestyle=':', alpha=0.6)

# Wykres 2: Przestrzeń Regresji (Chmura punktów)
ax2.scatter(I_test, I_ref, color='gray', alpha=0.4, label='Próbki w czasie (I_test vs I_ref)', s=15)

# Rysowanie prostej z wyliczonego k
x_vals = np.array([np.min(I_test), np.max(I_test)])
y_vals = k * x_vals
ax2.plot(x_vals, y_vals, color='red', linewidth=3, label=f'Prosta Regresji (Nachylenie k = {k:.3f})')
ax2.plot(x_vals, x_vals, color='black', linestyle=':', label='Kąt 45° (Gdyby prądy były identyczne)')

ax2.set_title('Regresja Liniowa (Poszukiwanie mnożnika k)')
ax2.set_xlabel('Prąd Badany [A]')
ax2.set_ylabel('Prąd Referencyjny [A]')
ax2.legend()
ax2.grid(True, linestyle=':', alpha=0.6)

plt.tight_layout()
plt.show()