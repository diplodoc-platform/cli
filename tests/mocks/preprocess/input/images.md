# Images ![svg image 1](_assets/1.svg)

![simple image](_assets/1.png)

<!-- ![comm svg image 1](_assets/1.svg) -->
1. `![code svg image 1](_assets/1.svg)`
![svg image 11](_assets/1.svg)

<!-- ![comm svg image 2](_assets/1.svg "Mountain" =100x200) -->
2. `![code svg image 2](_assets/1.svg "Mountain" =100x200)`
![svg image 2](_assets/1.svg "Mountain" =100x200)

<!-- ![comm reference image 3][image1] -->
3. `![code reference image 3][image1]`
![reference image 3][image1]

4. `![code image1][]`
![image1][]

[image1]: _assets/1.svg "Svg"

<!-- [![comm svg image 4](_assets/1.svg)](https://yandex.com/images/search?text=mountain) -->
5. `[![code svg image 4](_assets/1.svg)](https://yandex.com/images/search?text=mountain)`
[![svg image 4](_assets/1.svg)](https://yandex.com/images/search?text=mountain)

<!-- [![comm svg image 5](_assets/1.svg "Title"){width=100 height=200}](https://yandex.com/images/search?text=mountain) -->
6. `[![code svg image 5](_assets/1.svg "Title"){width=100 height=200}](https://yandex.com/images/search?text=mountain)`
[![svg image 5](_assets/1.svg "Title"){width=100 height=200}](https://yandex.com/images/search?text=mountain)

7. `![title][code]{width=100 height=200}`
![title][code]{width=100 height=200}

8. `![code][]{width=100}`
![code][]{width=100}

[code]: _assets/1.svg

9. `[![code Source Code][badge-source]][source]`
[![Source Code][badge-source]][source]

10. `![no inline for reference][png]`
![no inline for reference][png]

[badge-source]: _assets/1.svg
[png]: _assets/1.png
[source]: https://github.com/ramsey/uuid/tree/3.x

11. Definition list 
Term
:   Definition with 

    ![img](_assets/1.svg)
    and more text

12. `![code svg image 12](_assets/1.svg){inline=false}`
![svg image 12](_assets/1.svg){inline=false}

13. `![code svg image 13](_assets/1.svg){width=100  inline=false}`
![svg image 13](_assets/1.svg){width=100  inline=false}

14. `![code svg image 14](_assets/1.svg){inline=true width=100 }`
![svg image 14](_assets/1.svg){inline=true width=100 }

15. `![code svg image 15][code]{inline=true}`
![svg image 15][code]{inline=true}

20. Сodeblocks - no inline svg
```
Codeblock fence
![code svg image 20.1](_assets/1.svg)
```

````
Codeblock in codeblock
```
![code svg image 20.2](_assets/1.svg)
```
![code svg image 20.2](_assets/1.svg)
````

~~~
Codeblock tilda
![code svg image 20.3](_assets/1.svg)
~~~

```````md translate=no
Codeblock 10 fence
![code svg image 20.4](_assets/1.svg)
```````

    Codeblock 4 spaces
    ![code svg image 20.5](_assets/1.svg)
    row 3

1. Codeblock 4 spaces in list

        ![code svg image 20.6](_assets/1.svg)
1. Codeblock fence in list with bad gap
  ```
  ![code svg image 20.7](_assets/1.svg)
  ```

```md
Codeblock with inline code
   `![code svg image 22](_assets/1.svg)`
1. ![code svg image 23](_assets/1.svg)
```
